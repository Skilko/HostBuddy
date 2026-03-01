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

echo ""
echo "Will run: ${builds[*]}"
echo ""

failed=()
for build in "${builds[@]}"; do
  echo "--- Running: npm run $build ---"
  if npm run "$build"; then
    echo "--- Completed: $build ---"
  else
    echo "--- FAILED: $build ---"
    failed+=("$build")
  fi
  echo ""
done

echo "=== Build Summary ==="
echo "  Requested: ${builds[*]}"
if [[ ${#failed[@]} -gt 0 ]]; then
  echo "  Failed:    ${failed[*]}"
  exit 1
else
  echo "  All builds succeeded."
fi
