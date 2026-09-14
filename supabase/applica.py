#!/usr/bin/env python3
"""Applica i file di supabase/migrations/ in ordine, una volta sola.

    python supabase/applica.py            applica le migrazioni non ancora applicate
    python supabase/applica.py --stato    elenca cosa risulta applicato
"""
import os, sys, pathlib, hashlib, psycopg

BASE = pathlib.Path(__file__).resolve().parent
MIGR = BASE / "migrations"

def db_url():
    env = BASE.parent / ".env"
    if env.exists():
        for riga in env.read_text(encoding="utf-8").splitlines():
            if riga.startswith("SUPABASE_DB_URL="):
                return riga.split("=", 1)[1].strip()
    url = os.environ.get("SUPABASE_DB_URL")
    if not url:
        sys.exit("Manca SUPABASE_DB_URL (in .env o nell'ambiente).")
    return url

def main():
    solo_stato = "--stato" in sys.argv
    with psycopg.connect(db_url(), connect_timeout=30, autocommit=False) as c:
        c.execute("""create table if not exists public.migrazioni (
                       nome text primary key,
                       impronta text not null,
                       applicata timestamptz not null default now())""")
        c.commit()
        fatte = {n: i for n, i in c.execute("select nome, impronta from public.migrazioni").fetchall()}
        for f in sorted(MIGR.glob("*.sql")):
            sql = f.read_text(encoding="utf-8")
            imp = hashlib.sha256(sql.encode("utf-8")).hexdigest()[:16]
            if f.name in fatte:
                stato = "applicata" if fatte[f.name] == imp else "APPLICATA MA IL FILE E' CAMBIATO"
                print(f"  {f.name:<34} {stato}")
                continue
            if solo_stato:
                print(f"  {f.name:<34} da applicare")
                continue
            print(f"  {f.name:<34} applico...", end=" ", flush=True)
            try:
                c.execute(sql)
                c.execute("insert into public.migrazioni (nome, impronta) values (%s, %s)", (f.name, imp))
                c.commit()
                print("fatto")
            except Exception as e:
                c.rollback()
                print("ERRORE")
                sys.exit(f"\n{f.name}: {e}")

if __name__ == "__main__":
    main()
