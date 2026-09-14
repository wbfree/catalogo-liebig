#!/bin/sh
# Aggiornamento giornaliero: raccolta da eBay, poi ricostruzione del
# rilevamento su Supabase. Gira dentro il contenitore, senza nessuno che
# guardi, quindi ogni passo che fallisce deve fermare la catena.
set -e

echo "=============================================================="
echo "Catalogo Liebig - aggiornamento del $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "=============================================================="

echo
echo "--- 1. raccolta delle inserzioni attive (Browse API di eBay) ---"
# se la raccolta e' troppo magra, lo script esce con 1 e non sostituisce
# ebay_active.json: set -e ferma tutto qui
python automazione/raccolta_ebay_api.py "$@"

echo
echo "--- 2. ricostruzione del rilevamento su Supabase ---"
# build_dataset.py confronta con il rilevamento corrente e rifiuta di
# pubblicare se le cifre crollano; in quel caso il sito resta su ieri
python build_dataset.py

echo
echo "Aggiornamento concluso alle $(date '+%H:%M:%S')."
