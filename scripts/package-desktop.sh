#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")/.."
npm test
npm run pack
/usr/bin/ditto 'release/mac-arm64/Luma Keys.app' '/Users/prince/Desktop/Luma Keys.app'
print 'Updated /Users/prince/Desktop/Luma Keys.app. Restart it to use this build.'
