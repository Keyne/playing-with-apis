"""Sellable catalog plus two rows that must not be quoted."""

from datetime import datetime, timezone

PAST = datetime(2020, 1, 1, tzinfo=timezone.utc)
FUTURE = datetime(2099, 1, 1, tzinfo=timezone.utc)

# sku, name, amount_cents, active, valid_from
ROWS = [
    ("CAD-001", "Caderno A4", 2_500, True, PAST),
    ("CAD-002", "Caneta esferográfica", 350, True, PAST),
    ("CAD-003", "Mouse sem fio", 8_900, True, PAST),
    ("CAD-004", "Teclado", 15_900, True, PAST),
    ("CAD-005", "Monitor 24 polegadas", 89_900, True, PAST),
    ("CAD-006", "Headset", 18_900, True, PAST),
    ("CAD-007", "Hub USB", 7_200, True, PAST),
    ("CAD-008", "Cabo HDMI", 4_500, True, PAST),
    ("CAD-009", "Suporte para notebook", 12_900, True, PAST),
    ("CAD-010", "Licença anual de suporte", 250_000, True, PAST),
    ("CAD-OFF", "Mousepad", 4_000, False, PAST),
    ("CAD-FUT", "Cadeira", 80_000, True, FUTURE),
]


def seed_documents() -> list[dict]:
    documents = []
    for sku, name, amount_cents, active, valid_from in ROWS:
        documents.append(
            {
                "sku": sku,
                "name": name,
                "active": active,
                "price": {
                    "amountCents": amount_cents,
                    "currency": "BRL",
                    "validFrom": valid_from,
                },
            }
        )
    return documents
