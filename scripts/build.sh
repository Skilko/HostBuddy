#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo ""
echo "=== HostBuddy Distribution Builder ==="
echo ""
echo "Select builds to create (comma-separated, e.g. 1,2):"
echo ""
echo "  1) macOS arm64  (Apple Silicon)"
echo "  2) macOS x64    (Intel)"
echo "  3) macOS both   (arm64 + x64)"
echo "  4) Windows x64  (NSIS installer)"
echo ""
read -rp "Choice: " choices

if [[ -z "$choices" ]]; then
  echo "No selection made. Exiting."
  exit 0
fi

builds=()
IFS=',' read -ra selections <<< "$choices"
for sel in "${selections[@]}"; do
  sel="$(echo "$sel" | xargs)"
  case "$sel" in
    1) builds+=("dist:mac:arm64") ;;
    2) builds+=("dist:mac:x64") ;;
    3) builds+=("dist:mac:both") ;;
    4) builds+=("dist:win") ;;
    *) echo "Unknown option: $sel (skipping)" ;;
  esac
done

if [[ ${#builds[@]} -eq 0 ]]; then
  echo "No valid builds selected. Exiting."
  exit 0
fi

has_mac=false
for build in "${builds[@]}"; do
  case "$build" in
    dist:mac:*|dist:mac) has_mac=true ;;
  esac
done

if $has_mac; then
  echo ""
  read -rp "Sign and notarize macOS build? (y/n): " sign_choice
  sign_choice="$(echo "$sign_choice" | tr '[:upper:]' '[:lower:]')"

  if [[ "$sign_choice" == "y" ]]; then
    if [[ -f ".env.signing" ]]; then
      # shellcheck source=/dev/null
      source .env.signing
      echo "  Loaded signing credentials from .env.signing"
    else
      echo "  ERROR: .env.signing not found in project root."
      echo "  Create it with APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID."
      exit 1
    fi

    missing=()
    [[ -z "${APPLE_ID:-}" ]] && missing+=("APPLE_ID")
    [[ -z "${APPLE_APP_SPECIFIC_PASSWORD:-}" ]] && missing+=("APPLE_APP_SPECIFIC_PASSWORD")
    [[ -z "${APPLE_TEAM_ID:-}" ]] && missing+=("APPLE_TEAM_ID")
    if [[ ${#missing[@]} -gt 0 ]]; then
      echo "  ERROR: Missing required vars in .env.signing: ${missing[*]}"
      exit 1
    fi

    echo "  Signing enabled — will notarize after build."
  else
    export CSC_IDENTITY_AUTO_DISCOVERY=false
    echo "  Skipping code signing and notarization."
  fi
else
  export CSC_IDENTITY_AUTO_DISCOVERY=false
fi

echo ""
echo "Will run: ${builds[*]}"
echo ""

step=0
total=${#builds[@]}
failed=()
for build in "${builds[@]}"; do
  step=$((step + 1))
  echo "══════════════════════════════════════════"
  echo "  Step $step/$total: npm run $build"
  echo "  Started: $(date '+%H:%M:%S')"
  echo "══════════════════════════════════════════"
  echo ""
  if npm run "$build"; then
    echo ""
    echo "  Completed: $build ($(date '+%H:%M:%S'))"
  else
    echo ""
    echo "  FAILED: $build ($(date '+%H:%M:%S'))"
    failed+=("$build")
  fi
  echo ""
done

echo "══════════════════════════════════════════"
echo "  BUILD SUMMARY"
echo "══════════════════════════════════════════"
echo "  Requested: ${builds[*]}"
if [[ ${#failed[@]} -gt 0 ]]; then
  echo "  Failed:    ${failed[*]}"
  exit 1
else
  echo "  All builds succeeded."
fi

# --- Notarize macOS DMGs after build ---
if $has_mac && [[ "$sign_choice" == "y" ]] && [[ ${#failed[@]} -eq 0 ]]; then
  echo ""
  echo "══════════════════════════════════════════"
  echo "  NOTARIZING macOS DMGs"
  echo "══════════════════════════════════════════"

  version=$(node -p "require('./package.json').version")
  dmgs=()

  for build in "${builds[@]}"; do
    case "$build" in
      dist:mac:arm64) dmgs+=("dist/HostBuddy-${version}-mac-arm64.dmg") ;;
      dist:mac:x64)   dmgs+=("dist/HostBuddy-${version}-mac-x64.dmg") ;;
      dist:mac:both)
        dmgs+=("dist/HostBuddy-${version}-mac-arm64.dmg")
        dmgs+=("dist/HostBuddy-${version}-mac-x64.dmg")
        ;;
    esac
  done

  notarize_failed=()
  for dmg in "${dmgs[@]}"; do
    if [[ ! -f "$dmg" ]]; then
      echo "  WARNING: $dmg not found, skipping notarization."
      notarize_failed+=("$dmg")
      continue
    fi
    echo ""
    if node scripts/notarize.js "$dmg"; then
      echo "  Notarized: $dmg"
    else
      echo "  FAILED to notarize: $dmg"
      notarize_failed+=("$dmg")
    fi
  done

  echo ""
  echo "══════════════════════════════════════════"
  echo "  NOTARIZATION SUMMARY"
  echo "══════════════════════════════════════════"
  if [[ ${#notarize_failed[@]} -gt 0 ]]; then
    echo "  Failed: ${notarize_failed[*]}"
    exit 1
  else
    echo "  All DMGs notarized and stapled."
  fi
fi
