"""Génère les icônes PWA (écran d'accueil Android + iPhone).

Usage : python make_icons.py
Produit icons/icon-192.png, icon-512.png, icon-180.png (apple-touch) et icon-maskable-512.png.
"""
import os
from PIL import Image, ImageDraw

ACCENT = (181, 101, 29)        # brun/orange de l'app
CREME = (250, 246, 240)
INK = (44, 36, 32)
DOSSIER = "icons"


def dessiner(px, maskable=False):
    """Marmite stylisée centrée. maskable=True → plus de marge (zone de sécurité Android)."""
    img = Image.new("RGBA", (px, px), ACCENT + (255,))
    d = ImageDraw.Draw(img)
    u = px / 100.0                      # unité = 1% du côté
    marge = 22 if maskable else 14      # le masque Android rogne les bords

    # dimensions de la marmite
    larg = px - 2 * marge * u
    cx = px / 2
    haut_corps = larg * 0.58
    top = cx - haut_corps * 0.15
    gauche = marge * u
    droite = px - marge * u

    # couvercle
    ep = larg * 0.11
    d.rounded_rectangle([gauche - u * 2, top - ep * 1.5, droite + u * 2, top - ep * 0.2],
                        radius=ep / 2, fill=CREME)
    # bouton du couvercle
    r = larg * 0.07
    d.ellipse([cx - r, top - ep * 1.5 - r * 1.6, cx + r, top - ep * 1.5 + r * 0.4], fill=CREME)

    # corps de la marmite
    d.rounded_rectangle([gauche, top, droite, top + haut_corps],
                        radius=larg * 0.16, fill=CREME)

    # anses
    ah = haut_corps * 0.3
    ay = top + haut_corps * 0.22
    d.rounded_rectangle([gauche - larg * 0.1, ay, gauche + larg * 0.02, ay + ah],
                        radius=ah / 2, fill=CREME)
    d.rounded_rectangle([droite - larg * 0.02, ay, droite + larg * 0.1, ay + ah],
                        radius=ah / 2, fill=CREME)

    # trois traits de vapeur au-dessus du couvercle
    if not maskable:
        vy = top - ep * 2.6
        for i, dx in enumerate((-larg * 0.22, 0, larg * 0.22)):
            h = larg * (0.16 if i == 1 else 0.11)
            d.rounded_rectangle([cx + dx - u * 1.6, vy - h, cx + dx + u * 1.6, vy],
                                radius=u * 1.6, fill=CREME)
    return img


def main():
    os.makedirs(DOSSIER, exist_ok=True)
    sorties = [
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("icon-180.png", 180, False),   # apple-touch-icon (iPhone)
        ("icon-maskable-512.png", 512, True),
    ]
    for nom, px, mask in sorties:
        dessiner(px, mask).save(os.path.join(DOSSIER, nom))
        print("écrit :", os.path.join(DOSSIER, nom), f"({px}px)")


if __name__ == "__main__":
    main()
