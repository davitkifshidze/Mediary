"""
თარგმანების აუდიტი — რომელი `t('...')` გასაღები აკლია ლოკალიზაციას.

    python frontend/src/i18n/audit.py

რატომ არსებობს: 2026-09-06-მდე **562 გასაღები აკლდა** (980-იდან) და გვერდებზე
ნედლი `roles.title` / `purge.title` ჩანდა. ცარიელი გასაღები არსად ჩავარდება —
i18next უბრალოდ თვითონ გასაღებს დაბეჭდავს, ე.ი. არც build და არც lint არ
გაფრთხილებს. ეს სკრიპტი ერთადერთი ავტომატური შემოწმებაა.

⚠️ **ახალი გვერდის დაწერის შემდეგ გაუშვი.** ხუთი რამ მოწმდება:
  1. `t('a.b')` — სტატიკური გასაღები, რომელიც ფაილში არ არის;
  2. `t(`a.b.${x}`)` — დინამიური პრეფიქსი (რამდენი გასაღებია მის ქვეშ; **0**
     ნიშნავს, რომ სექცია საერთოდ არ არსებობს);
  3. ka/en სხვაობა — ერთში დამატებული და მეორეში დავიწყებული გასაღები;
  4. **გასაღების მსგავსი სტრიქონი `t()`-ის გარეთ** (Tasks §1.4) — გასაღები
     ხშირად რუკაში ინახება (`HEADLINES = { gallery: 'queue.galleryRunning' }`)
     და `t()`-ს ცვლადად გადაეცემა; მაშინ 1-ლი შემოწმება ვერ ხედავს. ასე
     დაიკარგა `queue.galleryRunning` და გვერდზე ნედლი გასაღები ჩანდა;
  5. **ინტერპოლაციის შეუსაბამობა** (Tasks §1.4) — `t('k', { size })` vs
     ტექსტში `{{bytes}}`. i18next უცნობ `{{...}}`-ს **ტექსტად ბეჭდავს**, ე.ი.
     არც build, არც lint და არც 1–3 შემოწმება არ იჭერს. ასე ჩანდა
     „14 ობოლი ფაილი · {{bytes}}".
"""
import json
import io
import os
import re
import collections

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.abspath(os.path.join(HERE, ".."))

KEY_RE = re.compile(r"""\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]""")
# ⚠️ **პრეფიქსი ყოველთვის წერტილით არ მთავრდება.** `t(`bulkVideo.action_${a}`)-ს
# ძველი შაბლონი (`.` + `${`) **ვერ ხედავდა**, ე.ი. ექვსი გასაღები ჩუმად აკლდა,
# აუდიტი კი „0 missing"-ს წერდა. ახლა ვიღებთ ყველაფერს `${`-მდე და პრეფიქსად
# ისე ვიყენებთ, როგორც არის: `bulkVideo.action_` · `boardGames.statuses.`
TPL_RE = re.compile(r"""\bt\(\s*`([a-zA-Z0-9_.]+)\$\{""")
# ნებისმიერი 'a.b' სტრიქონი — გასაღებად მხოლოდ მაშინ ჩაითვლება, თუ პირველი
# სეგმენტი ლოკალის ნამდვილი namespace-ია (იხ. `literal_keys`)
LIT_RE = re.compile(r"""['"]([a-z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+)['"]""")
# `t('key', { … })` — არგუმენტების ბლოკის დასაწყისი
ARGS_RE = re.compile(r"""\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]\s*,\s*\{""")
# ბლოკის ზედა დონის `name:` / `name,` (shorthand)
# ⚠️ დამხურავი სიმბოლო **lookahead-ია**: `{ page, last: x }`-ში მძიმეს რომ
# შთანთქავდა, `last` შემდეგ დამთხვევას აღარ დარჩებოდა და ცრუ განგაში გამოვიდოდა
OPT_RE = re.compile(r"""(?:^|[{,])\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=[:,}])""")
PLACEHOLDER_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)")
# i18next-ის საკუთარი პარამეტრები — ტექსტში `{{…}}`-ად არ ჩნდებიან
I18N_OPTS = {"count", "context", "defaultValue", "ns", "lng", "replace", "returnObjects"}


def source_files():
    for root, _dirs, files in os.walk(SRC):
        if os.path.basename(root) == "i18n":
            continue
        for name in files:
            if name.endswith((".ts", ".tsx")):
                path = os.path.join(root, name)
                yield path, io.open(path, encoding="utf-8").read()


def used_keys():
    static, dynamic, literal = collections.Counter(), set(), collections.defaultdict(set)

    for path, text in source_files():
        rel = os.path.relpath(path, SRC).replace("\\", "/")
        for m in KEY_RE.finditer(text):
            static[m.group(1)] += 1
        for m in TPL_RE.finditer(text):
            dynamic.add(m.group(1))
        for m in LIT_RE.finditer(text):
            literal[m.group(1)].add(rel)

    return static, dynamic, literal


def option_names(text, brace_at):
    """`t('k', {` -ის შემდეგ ბლოკის ზედა დონის პარამეტრების სახელები.

    ბრეისებს ვითვლით, ე.ი. ჩადგმული ობიექტი/ფუნქცია ბლოკს ნაადრევად არ ხურავს.
    """
    depth, i = 0, brace_at
    while i < len(text):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                break
        i += 1
    block = text[brace_at : i + 1]
    # ჩადგმული ბლოკები ცარიელით ჩავანაცვლოთ, რომ მხოლოდ ზედა დონე დარჩეს
    inner = re.sub(r"\{[^{}]*\}", " ", block[1:-1])
    while re.search(r"\{[^{}]*\}", inner):
        inner = re.sub(r"\{[^{}]*\}", " ", inner)
    return {m.group(1) for m in OPT_RE.finditer("{" + inner + "}")}


def interpolation_problems(flat):
    """გასაღების სია, სადაც `t()`-ის პარამეტრები და `{{…}}` არ ემთხვევა."""
    out = []
    for path, text in source_files():
        rel = os.path.relpath(path, SRC).replace("\\", "/")
        for m in ARGS_RE.finditer(text):
            key, value = m.group(1), flat.get(m.group(1))
            if not isinstance(value, str):
                continue
            needed = set(PLACEHOLDER_RE.findall(value))
            given = option_names(text, m.end() - 1) | I18N_OPTS
            unmet = sorted(needed - given)
            if unmet:
                out.append((key, rel, unmet))
    return out


def flatten(node, prefix=""):
    out = {}
    for key, value in node.items():
        full = f"{prefix}{key}"
        if isinstance(value, dict):
            out.update(flatten(value, full + "."))
        else:
            out[full] = value
    return out


def main() -> int:
    static, dynamic, literal = used_keys()
    locales = {
        name: flatten(json.load(io.open(os.path.join(HERE, name), encoding="utf-8")))
        for name in ("ka.json", "en.json")
    }

    problems = 0

    for name, flat in locales.items():
        missing = sorted(k for k in static if k not in flat)
        problems += len(missing)
        print(f"{name}: {len(missing)} missing of {len(static)} used")
        for key in missing:
            print(f"    {key}  ({static[key]}x)")

    print("\ndynamic prefixes:")
    for prefix in sorted(dynamic):
        # პრეფიქსი ან წერტილით მთავრდება (`a.b.`), ან სეგმენტის შუაში წყდება
        # (`a.action_`) — ორივეზე სწორია უბრალო `startswith`
        count = sum(1 for k in locales["ka.json"] if k.startswith(prefix))
        mark = "  <-- EMPTY" if count == 0 else ""
        problems += 1 if count == 0 else 0
        print(f"    {prefix}* -> {count}{mark}")

    # 4. გასაღების მსგავსი სტრიქონი `t()`-ის გარეთ (რუკებში შენახული გასაღები)
    ka = locales["ka.json"]
    namespaces = {k.split(".")[0] for k in ka}
    # ⚠️ `boardGames.statuses`-ის ჯიშის სტრიქონი **პრეფიქსია** და არა გასაღები
    # (`t(`${ns}.${status}`)`) — თუ მას შვილები აქვს, ეს ცრუ განგაშია
    prefixes = {k.rsplit(".", 1)[0] for k in ka if "." in k}
    suspects = sorted(
        (key, sorted(files))
        for key, files in literal.items()
        if key.split(".")[0] in namespaces
        and key not in ka
        and key not in static
        and key not in prefixes
    )
    problems += len(suspects)
    print(f"\nkey-like literals outside t(): {len(suspects)}")
    for key, files in suspects:
        print(f"    {key}  ({', '.join(files)})")

    # 5. ინტერპოლაცია — `{{…}}`, რომელსაც პარამეტრი არ მოსდევს
    mismatches = interpolation_problems(ka)
    problems += len(mismatches)
    print(f"\ninterpolation mismatches: {len(mismatches)}")
    for key, rel, unmet in mismatches:
        print(f"    {key}  ({rel}) — no value for {', '.join('{{%s}}' % v for v in unmet)}")

    only_ka = sorted(set(locales["ka.json"]) - set(locales["en.json"]))
    only_en = sorted(set(locales["en.json"]) - set(locales["ka.json"]))
    problems += len(only_ka) + len(only_en)
    print(f"\nonly in ka: {len(only_ka)} · only in en: {len(only_en)}")
    for key in only_ka + only_en:
        print(f"    {key}")

    print("\nOK" if problems == 0 else f"\n{problems} problem(s)")
    return 0 if problems == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
