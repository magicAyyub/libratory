import re
import unicodedata


_HORIZONTAL_SPACE = r"[ \t\u00a0\u202f]"
_SPECIAL_SPACES = re.compile(r"[\u00a0\u202f\u2002\u2003\u2007\u2009\u200a]")
_CLOCK_TIME = re.compile(r"(?<![\d:])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])")
_TIME_WORDS = {"à", "vers", "dès", "depuis", "avant", "après"}
# Grouped by space or dot is left alone: "€5 200 personnes" and a dot the chunker split are unclear
_AMOUNT = r"(?!\d+(?: \d{3}|\. ?\d))(\d+(?:,\d{3})*(?:,\d{1,2}(?!\d))?)"
_INVISIBLE = re.compile(r"[\u00ad\u200b\u200c\u200d\u2060\ufeff]")
_LOOKALIKES = str.maketrans({
    "\u2019": "'", "\u2018": "'", "\u201a": "'", "\u02bc": "'", "\u02b9": "'",
    "\u00b4": "'", "`": "'", "\u2032": "'", "\u2010": "-", "\u2011": "-",
    "\ufb00": "ff", "\ufb01": "fi", "\ufb02": "fl", "\ufb03": "ffi", "\ufb04": "ffl",
})


def _spoken_time(match: re.Match[str]) -> str:
    # 3:16, 1:50 and 16:10 are often references or ratios, so a time must be announced
    words = [re.split(r"['’]", word)[-1].lower() for word in match.string[: match.start()].split()[-2:]]
    announced = words[-2:] == ["il", "est"] or (len(match.group(1)) == 2 and words[-1:] and words[-1] in _TIME_WORDS)
    return f"{match.group(1)} h {match.group(2)}" if announced else match.group(0)


def _spell_currency(text: str, symbol: str, name: str, of_name: str) -> str:
    mark = re.escape(symbol)
    before = r"(?<![A-Za-z0-9])"
    text = re.sub(rf"{before}{mark} ?{_AMOUNT} (millions?|milliards?)\b", rf"\1 \2 {of_name}", text)
    text = re.sub(rf"{before}{mark} ?{_AMOUNT} mille\b", rf"\1 mille {name}", text)
    text = re.sub(rf"{before}{mark} ?{_AMOUNT}", rf"\1 {name} ", text)
    return re.sub(rf"(\d) ?{mark}(?![A-Za-z]) *", rf"\1 {name} ", text)


def _spell_french_symbols(text: str) -> str:
    text = _CLOCK_TIME.sub(_spoken_time, text)
    text = re.sub(r"={2,}", " ", text)
    text = _spell_currency(text, "€", "euros", "d'euros")
    text = _spell_currency(text, "$", "dollars", "de dollars")
    text = re.sub(r"(\d) ?% *", r"\1 pour cent ", text)
    text = re.sub(r"(\d) ?°C(?![A-Za-z]) *", r"\1 degrés ", text)
    # French keeps the singular below two
    text = re.sub(r"(?<![\d,.])([01](?:,\d{1,2})?) (euro|dollar|degré)s\b", r"\1 \2", text)
    for symbol, word in (("&", "et"), ("+", "plus"), ("=", "égal"), ("@", "arobase")):
        text = re.sub(r" *" + re.escape(symbol) + " *", f" {word} ", text)
    return re.sub(r" +([,.;!?])", r"\1", re.sub(r" {2,}", " ", text)).strip()


def synthesis_text_for(text: str, language: str) -> str:
    if language != "french_24l":
        return text

    # Book files carry characters that look right on the page and sound wrong: the model has no
    # token for them, so they reach it as raw bytes. Decomposed accents are the same trap.
    text = unicodedata.normalize("NFC", text)
    text = _INVISIBLE.sub("", text).translate(_LOOKALIKES)
    text = _SPECIAL_SPACES.sub(" ", text)
    text = _spell_french_symbols(text)
    text = re.sub(r"«" + _HORIZONTAL_SPACE + "*", "", text)
    text = re.sub(_HORIZONTAL_SPACE + "*»", "", text)
    text = re.sub(r"(?<=\d)" + _HORIZONTAL_SPACE + "*/" + _HORIZONTAL_SPACE + r"*(?=\d)", " ", text)
    text = re.sub(r"(?<!\d)" + _HORIZONTAL_SPACE + "*:" + _HORIZONTAL_SPACE + r"*(?!\d)", ", ", text)
    text = re.sub(_HORIZONTAL_SPACE + r"+[-–—]" + _HORIZONTAL_SPACE + "+", ", ", text)
    text = re.sub(_HORIZONTAL_SPACE + r"{2,}", " ", text)
    text = re.sub(_HORIZONTAL_SPACE + r"+([,.;!?])", r"\1", text)
    return text
