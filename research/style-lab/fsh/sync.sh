#!/bin/bash
# копия src/scenes/fs (+camPath) в .js для проверки в браузере
H=$(dirname "$0"); R=/home/claude/gemvid/src
for f in post look kit; do sed -E "s#from '\./(post|look|kit)'#from './\1.js'#g" $R/scenes/fs/$f.ts > $H/$f.js; done
for f in $R/scenes/fs/worlds/*.ts; do b=$(basename $f .ts); sed -E "s#from '\.\./(kit|look|post)'#from '../\1.js'#g" $f > $H/worlds/$b.js; done
