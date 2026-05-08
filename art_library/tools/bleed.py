"""bleed.py — apply bleed to a card-face image."""
from PIL import Image
from library import dimensions_for_dpi


def apply_bleed(face_image: Image.Image, dpi: int, method: str = "mirror") -> Image.Image:
    """
    Resize face_image to the canonical face size at dpi, then surround with bleed.
    Returns a fully bleed-padded RGB image.
    """
    fw, fh, tw, th, bp = dimensions_for_dpi(dpi)
    face = face_image.resize((fw, fh), Image.LANCZOS).convert("RGB")

    if method == "black":
        canvas = Image.new("RGB", (tw, th), (0, 0, 0))
        canvas.paste(face, (bp, bp))
        return canvas

    if method == "white":
        canvas = Image.new("RGB", (tw, th), (255, 255, 255))
        canvas.paste(face, (bp, bp))
        return canvas

    if method == "edge":
        canvas = Image.new("RGB", (tw, th))
        canvas.paste(face, (bp, bp))
        top = face.crop((0, 0, fw, 1)).resize((fw, bp))
        canvas.paste(top, (bp, 0))
        bot = face.crop((0, fh - 1, fw, fh)).resize((fw, bp))
        canvas.paste(bot, (bp, bp + fh))
        left = face.crop((0, 0, 1, fh)).resize((bp, fh))
        canvas.paste(left, (0, bp))
        right = face.crop((fw - 1, 0, fw, fh)).resize((bp, fh))
        canvas.paste(right, (bp + fw, bp))
        for (sx, sy, dx, dy) in [
            (0, 0, 0, 0),
            (fw - 1, 0, bp + fw, 0),
            (0, fh - 1, 0, bp + fh),
            (fw - 1, fh - 1, bp + fw, bp + fh),
        ]:
            corner = face.crop((sx, sy, sx + 1, sy + 1)).resize((bp, bp))
            canvas.paste(corner, (dx, dy))
        return canvas

    # default: mirror
    canvas = Image.new("RGB", (tw, th))
    canvas.paste(face, (bp, bp))
    top = face.crop((0, 0, fw, bp)).transpose(Image.FLIP_TOP_BOTTOM)
    canvas.paste(top, (bp, 0))
    bot = face.crop((0, fh - bp, fw, fh)).transpose(Image.FLIP_TOP_BOTTOM)
    canvas.paste(bot, (bp, bp + fh))
    left = face.crop((0, 0, bp, fh)).transpose(Image.FLIP_LEFT_RIGHT)
    canvas.paste(left, (0, bp))
    right = face.crop((fw - bp, 0, fw, fh)).transpose(Image.FLIP_LEFT_RIGHT)
    canvas.paste(right, (bp + fw, bp))
    tl = face.crop((0, 0, bp, bp)).transpose(Image.ROTATE_180)
    tr = face.crop((fw - bp, 0, fw, bp)).transpose(Image.ROTATE_180)
    bl = face.crop((0, fh - bp, bp, fh)).transpose(Image.ROTATE_180)
    br = face.crop((fw - bp, fh - bp, fw, fh)).transpose(Image.ROTATE_180)
    canvas.paste(tl, (0, 0))
    canvas.paste(tr, (bp + fw, 0))
    canvas.paste(bl, (0, bp + fh))
    canvas.paste(br, (bp + fw, bp + fh))
    return canvas


def detect_face_only(img: Image.Image, dpi: int) -> bool:
    """
    Heuristic: if image dims are close to the face-size at dpi, treat it as
    face-only and add bleed. If dims are close to face+bleed at dpi, treat
    it as already-bleed. Returns True if face-only.
    """
    fw, fh, tw, th, _ = dimensions_for_dpi(dpi)
    iw, ih = img.size
    face_dist = abs(iw - fw) + abs(ih - fh)
    full_dist = abs(iw - tw) + abs(ih - th)
    return face_dist <= full_dist
