# -*- coding: utf-8 -*-
"""Donnees nominatives de la prospection (personnes, emails, exclusions
demandees par les briefs) : elles vivent dans prospect/prive/donnees.json,
fichier local exclu de git. Le depot est public, le code n'en contient aucune.

Sans le fichier, chaque cle rend sa valeur par defaut (vide) : le code tourne,
il ne retrouve simplement pas ces cas particuliers.
"""
import io
import json
import os

FICHIER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "prive", "donnees.json")
_cache = None


def prive(section, cle, defaut):
    global _cache
    if _cache is None:
        _cache = json.load(io.open(FICHIER, encoding="utf-8")) if os.path.exists(FICHIER) else {}
    return _cache.get(section, {}).get(cle, defaut)
