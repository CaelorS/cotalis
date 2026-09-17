#!/bin/sh
# Ajoute un numéro de version aux fichiers CSS et JS référencés par les pages, pour contourner le cache des navigateurs.
# À lancer avant chaque commit : sh scripts/stamp.sh
cd "$(dirname "$0")/.." || exit 1
v=$(date +%Y%m%d%H%M)
for f in index.html estimation.html apropos.html admin/index.html; do
  sed -i '' -E "s#((\.\./)?assets/css/site\.css|(\.\./)?assets/js/[a-z]+\.js|(\.\./)?config\.js)(\?v=[0-9]+)?\"#\1?v=$v\"#g" "$f"
done
echo "version $v"
