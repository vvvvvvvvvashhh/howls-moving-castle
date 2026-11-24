"""The approved v5 display-space chroma finish, applied once at final encoding.

Input PNGs already contain Blender's AgX display transform. Preserve their Y-prime
plane and obtain only chroma from the gamut-protected RGB LUT. No exposure changes.
"""
from pathlib import Path

SATURATION = 1.08
LUT_NAME = "film_chroma_v5.cube"

def write_chroma_lut(directory):
    """Write fixed display-space transfer coefficients. FFmpeg applies this LUT."""
    path = directory / LUT_NAME
    size = 33
    extra = SATURATION - 1
    with path.open("w", encoding="ascii", newline="\n") as lut:
        lut.write(f'TITLE "Display chroma {SATURATION:.2f} with preserved RGB boundary detail"\n')
        lut.write(f"LUT_3D_SIZE {size}\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n")
        for blue in range(size):
            for green in range(size):
                for red in range(size):
                    rgb = [channel / (size - 1) for channel in (red, green, blue)]
                    y = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
                    high, low = max(rgb), min(rgb)
                    room = 1000.0
                    if high > y + 1e-7:
                        room = (1.0 - high) / (high - y)
                    if y > low + 1e-7:
                        room = min(room, low / (y - low))
                    position = max(0.0, min(1.0, room / (2.0 * extra))) if extra > 0 else 1.0
                    gain = 1.0 + extra * position * position * (3.0 - 2.0 * position)
                    values = (y + (channel - y) * gain for channel in rgb)
                    lut.write(" ".join(f"{value:.8f}" for value in values) + "\n")
    return path

def grade_filter(saturation=SATURATION, extension="png", protect_gamut=False):
    """Convert display-referred native frames to Rec.709 Y′CbCr; scale only Cb/Cr."""
    if not 0 <= saturation <= 3:
        raise ValueError("Saturation must be between 0 and 3")
    # RGB PNGs have already received Blender's AgX display transform. Preserve
    # those nonlinear RGB values while converting the channel representation.
    # The earlier JPEG references were encoded with the standard JPEG matrix.
    if extension == "png":
        source = "format=gbrp,zscale=matrixin=gbr:"
        rgb = "format=gbrp16le"
    elif extension == "jpg":
        source = "zscale=matrixin=170m:chromalin=center:"
        rgb = ("zscale=matrixin=170m:matrix=gbr:rangein=full:range=full:"
               "chromalin=center:filter=spline36,format=gbrp16le")
    else:
        raise ValueError(f"Unsupported input type: {extension}")
    convert = (source + "matrix=709:rangein=full:range=limited:chromal=left:"
               "filter=spline36,format=yuv420p16le")
    delivery = ("zscale=matrixin=709:matrix=709:rangein=limited:range=limited:"
                "chromalin=left:chromal=left:dither=ordered,format=yuv420p,setsar=1,"
                "setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709")
    if not protect_gamut:
        chroma = f"round(32768+{saturation:.6f}*(val-32768))"
        return f"{convert},lutyuv=y=val:u={chroma}:v={chroma},{delivery}"
    if saturation != SATURATION:
        raise ValueError("The approved gamut-protected LUT uses the production saturation setting")
    # Reuse the untouched source Y′ plane, including its exact quantisation.
    # Only the Cb and Cr planes come from the gamut-aware colour transform.
    return (
        f"split=2[luma_in][chroma_in];[luma_in]{convert}[original_luma];"
        f"[chroma_in]{rgb},lut3d=file={LUT_NAME}:interp=tetrahedral,"
        "zscale=matrixin=gbr:matrix=709:rangein=full:range=limited:"
        "chromal=left:filter=spline36,format=yuv420p16le[graded_chroma];"
        "[original_luma][graded_chroma]mergeplanes=format=yuv420p16le:"
        f"map0s=0:map0p=0:map1s=1:map1p=1:map2s=1:map2p=2,{delivery}"
    )
