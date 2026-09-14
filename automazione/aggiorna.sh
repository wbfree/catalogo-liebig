#!/bin/sh
# Aggiornamento giornaliero: raccolta da eBay, poi ricostruzione del
# rilevamento su Supabase. Gira dentro il contenitore, senza nessuno che
# guardi, quindi ogni passo che fallisce deve fermare la catena.
set -e

echo "=============================================================="
echo "Catalogo Liebig - aggiornamento del $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "=============================================================="

echo
echo "--- 1. raccolta delle inserzioni attive su eBay.it ---"
# se la raccolta e' troppo magra, raccolta_ebay.py esce con 1 e non
# sostituisce ebay_active.json: set -e ferma tutto qui
python automazione/raccolta_ebay.py "$@"

echo
echo "--- 2. ricostruzione del rilevamento su Supabase ---"
# build_dataset.py rifiuta di pubblicare se il confronto con il rilevamento
# precedente mostra un crollo; in quel caso il sito resta su ieri
python build_dataset.py

echo
echo "Aggiornamento concluso alle $(date '+%H:%M:%S')."
