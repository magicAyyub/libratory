import re
import unicodedata


_HORIZONTAL_SPACE = r"[ \t\u00a0\u202f]"
_SPECIAL_SPACES = re.compile(r"[\u00a0\u202f\u2002\u2003\u2007\u2009\u200a]")
_INVISIBLE = re.compile(r"[\u00ad\u200b\u200c\u200d\u2060\ufeff]")
_LOOKALIKES = str.maketrans({
    "\u2019": "'", "\u2018": "'", "\u201a": "'", "\u02bc": "'", "\u02b9": "'",
    "\u00b4": "'", "`": "'", "\u2032": "'", "\u2010": "-", "\u2011": "-",
    "\ufb00": "ff", "\ufb01": "fi", "\ufb02": "fl", "\ufb03": "ffi", "\ufb04": "ffl",
})


def synthesis_text_for(text: str, language: str) -> str:
    if language != "french_24l":
        return text

    # Book files carry characters that look right on the page and sound wrong: the model has no
    # token for them, so they reach it as raw bytes. Decomposed accents are the same trap.
    text = unicodedata.normalize("NFC", text)
    text = _INVISIBLE.sub("", text).translate(_LOOKALIKES)
    text = _SPECIAL_SPACES.sub(" ", text)
    text = re.sub(r"«" + _HORIZONTAL_SPACE + "*", "", text)
    text = re.sub(_HORIZONTAL_SPACE + "*»", "", text)
    text = re.sub(r"(?<=\d)" + _HORIZONTAL_SPACE + "*/" + _HORIZONTAL_SPACE + r"*(?=\d)", " ", text)
    text = re.sub(r"(?<!\d)" + _HORIZONTAL_SPACE + "*:" + _HORIZONTAL_SPACE + r"*(?!\d)", ", ", text)
    text = re.sub(_HORIZONTAL_SPACE + r"+[-–—]" + _HORIZONTAL_SPACE + "+", ", ", text)
    text = re.sub(_HORIZONTAL_SPACE + r"{2,}", " ", text)
    text = re.sub(_HORIZONTAL_SPACE + r"+([,.;!?])", r"\1", text)
    return text
