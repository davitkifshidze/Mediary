"""
თარგმანების აუდიტი — რომელი `t('...')` გასაღები აკლია ლოკალიზაციას.

    python frontend/src/i18n/audit.py

რატომ არსებობს: 2026-09-06-მდე **562 გასაღები აკლდა** (980-იდან) და გვერდებზე
ნედლი `roles.title` / `purge.title` ჩანდა. ცარიელი გასაღები არსად ჩავარდება —
i18next უბრალოდ თვითონ გასაღებს დაბეჭდავს, ე.ი. არც build და არც lint არ
გაფრთხილებს. ეს სკრიპტი ერთადერთი ავტომატური შემოწმებაა.

⚠️ **ახალი გვერდის დაწერის შემდეგ გაუშვი.** შვიდი რამ მოწმდება:
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
     „14 ობოლი ფაილი · {{bytes}}";
  6. **დინამიური პრეფიქსის ცალკეული წევრი** — მე-2 შემოწმება მხოლოდ იმას
     ამბობს, რომ პრეფიქსს *რაღაც* აქვს ქვეშ. `sync.field.trailer` სწორედ ასე
     დაიკარგა: `SYNC_FIELDS`-ს ახალი წევრი დაემატა, ტექსტი კი — არა;
  7. **აკრძალული ტერმინი** (GAP-15) — ერთ ცნებას ერთი სიტყვა უნდა ჰქონდეს.
     „ლინკი"/„ბმული", „ჩამოწერა"/„ჩამოტვირთვა", „კლავიში"/„გასაღები" ერთ
     ინტერფეისში ერთდროულად ცხოვრობდნენ და მომხმარებელი ვერ ხვდებოდა, ერთი
     საქმეა თუ ორი. სრული ცხრილი — `GLOSSARY.md`.
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
# კოდში აღწერილი მნიშვნელობების ნაკრები — `['title', 'description', …]`.
# ⚠️ სწორედ ასეთი მასივი კვებავს დინამიურ გასაღებს (`SYNC_FIELDS` →
# `t(`sync.field.${f}`)`), ე.ი. „პრეფიქსი არსებობს" შემოწმება საკმარისი არაა.
VALUE_SET_RE = re.compile(
    r"""\[\s*((?:['"][a-zA-Z0-9_]+['"]\s*,\s*)+['"][a-zA-Z0-9_]+['"])\s*,?\s*\]"""
)
MEMBER_RE = re.compile(r"""['"]([a-zA-Z0-9_]+)['"]""")
IMPORT_RE = re.compile(r"""from\s+['"]@/([a-zA-Z0-9_/.\-]+)['"]""")
# i18next-ის საკუთარი პარამეტრები — ტექსტში `{{…}}`-ად არ ჩნდებიან
I18N_OPTS = {"count", "context", "defaultValue", "ns", "lng", "replace", "returnObjects"}
# მე-6 შემოწმების ცნობილი და **გამართლებული** ხარვეზები: ნაკრებში წევრია,
# ინტერფეისი კი მას არასდროს ხატავს, ე.ი. ტექსტი მართლაც არ სჭირდება.
# ⚠️ ახალი ჩანაწერი მხოლოდ მიზეზთან ერთად — სია სწორედ იმისთვისაა მოკლე,
# რომ „დავამატოთ და მოვისვენოთ" გამოსავალი არ გახდეს.
KNOWN_GAPS = {
    # `GALLERY_CAST_MODES`-ში `none` „არჩევანი არ გაკეთებულა"-ს ნიშნავს —
    # დიალოგი მას ჩიპად არ ხატავს (იხ. `GalleryDownloadDialog.castModes`)
    ("gallery.cast.", ("none",)),
}
# მე-7 შემოწმება (GAP-15): აკრძალული სიტყვა → სწორი. ⚠️ **მხოლოდ `ka.json`** —
# კოდის ქართული კომენტარები დეველოპერს ელაპარაკებიან და პროდუქტის ლექსიკას არ
# ქმნიან. ახალი წყვილი აქაც და `GLOSSARY.md`-შიც ერთდროულად ემატება.
# ⚠️ „სინქრონი" აქ განზრახ არაა: ის სწორი „სინქრონიზაციის" ქვესტრიქონია, ე.ი.
# ყოველ სწორ ხმარებაზე იყვირებდა. მისი დაცვა ლექსიკონსა და კოდის მიმოხილვაზეა.
BANNED = (
    ("ლინკ", "ბმული"),
    ("თამბნეილ", "ესკიზი"),
    ("კლავიშ", "გასაღები"),
    ("ნიკნეიმ", "მეტსახელი"),
    ("ფრენჩაიზ", "ფრანჩაიზი"),
    ("ჩამოწერ", "ჩამოტვირთვა"),
    ("ჩამოიწერ", "ჩამოტვირთვა"),
)


def source_files():
    for root, _dirs, files in os.walk(SRC):
        if os.path.basename(root) == "i18n":
            continue
        for name in files:
            if name.endswith((".ts", ".tsx")):
                path = os.path.join(root, name)
                yield path, io.open(path, encoding="utf-8").read()


def resolve(spec, known):
    """`@/api/media` → `api/media.ts`, თუ ასეთი ფაილი მართლა არსებობს."""
    for candidate in (spec + ".ts", spec + ".tsx", spec + "/index.ts", spec + "/index.tsx"):
        if candidate in known:
            return candidate
    return None


def used_keys():
    static, dynamic, literal = collections.Counter(), collections.defaultdict(set), collections.defaultdict(set)
    # ნაკრები → რომელ ფაილებშია აღწერილი
    value_sets = collections.defaultdict(set)
    # ფაილი → რომელი გასაღების ბოლო სეგმენტები იკითხება იქვე სტატიკურად
    local_tails = collections.defaultdict(set)
    imports = {}
    texts = {}

    for path, text in source_files():
        rel = os.path.relpath(path, SRC).replace("\\", "/")
        texts[rel] = text
        for m in KEY_RE.finditer(text):
            static[m.group(1)] += 1
            local_tails[rel].add(m.group(1).rsplit(".", 1)[-1])
        for m in TPL_RE.finditer(text):
            dynamic[m.group(1)].add(rel)
        for m in LIT_RE.finditer(text):
            literal[m.group(1)].add(rel)
        for m in VALUE_SET_RE.finditer(text):
            members = tuple(sorted(set(MEMBER_RE.findall(m.group(1)))))
            if len(members) >= 3:
                value_sets[members].add(rel)

    known = set(texts)
    for rel, text in texts.items():
        imports[rel] = {
            hit for hit in (resolve(m.group(1), known) for m in IMPORT_RE.finditer(text)) if hit
        }

    return static, dynamic, literal, value_sets, local_tails, imports


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


def banned_terms(flat):
    """(გასაღები, აკრძალული სიტყვა, სწორი) — ლექსიკონის დარღვევები `ka.json`-ში."""
    out = []
    for key, value in sorted(flat.items()):
        if not isinstance(value, str):
            continue
        for word, correct in BANNED:
            if word in value:
                out.append((key, word, correct))
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
    static, dynamic, literal, value_sets, local_tails, imports = used_keys()
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

    # 6. **დინამიური პრეფიქსის წევრები** (2026-09-12).
    #
    # ⚠️ მე-2 შემოწმება მხოლოდ იმას ამბობს, რომ პრეფიქსს *რაღაც* აქვს ქვეშ.
    # ასე გაჩერდა `sync.field.trailer` თვეზე მეტი: `SYNC_FIELDS`-ს `trailer`
    # დაემატა, ტექსტი — არა, პრეფიქსს კი შვიდი გასაღები ისედაც ჰქონდა და
    # აუდიტი „0 missing"-ს წერდა, გვერდზე კი ნედლი `sync.field.trailer` ჩანდა.
    #
    # ჰეურისტიკა სამ ფილტრზე დგას და სამივე აუცილებელია — პირველი ვერსია
    # მხოლოდ „უმრავლესობას უკვე აქვს გასაღები"-ს ამოწმებდა და **45 ცრუ
    # განგაში** გამოიტანა (ყოველი გვერდის `sort`-ის მასივი ყოველ `*.sort.`
    # პრეფიქსს ედრებოდა, რადგან `title`/`year`/`rating` ყველგან იმეორება):
    #
    #  ა) **ნაკრები ხელმისაწვდომი უნდა იყოს** — ან იმავე ფაილშია, სადაც
    #     `t(`პრეფიქსი.${x}`)` წერია, ან იმ ფაილიდან იმპორტირებულ ფაილში
    #     (`SYNC_FIELDS` `api/media.ts`-შია, `t()` კი `SyncDialog.tsx`-ში);
    #  ბ) **უმრავლესობას უკვე უნდა ჰქონდეს გასაღები** (>= 3 და >= 75%) —
    #     ე.ი. სია და პრეფიქსი მართლა ერთმანეთისაა. ზღვარი 60%-იდან აიწია,
    #     რადგან `api/books.ts`-ის **ფორმის** ველების სია
    #     (`['year', 'pages', 'genre_id', 'series_number', 'rating']`) ზუსტად
    #     3/5-ით ხვდებოდა `books.sort.`-ს და ცრუ განგაშს ატეხდა;
    #  გ) წევრი **მიტევებულია, თუ იმავე ფაილში სხვა გასაღებით იკითხება** —
    #     `{v === 'all' ? t('filter.all') : t(`visibility.${v}`)}` ხშირი
    #     იდიომაა და `visibility.all` მართლაც არ უნდა არსებობდეს.
    #  დ) **ერთ ნაკრებს ერთი პრეფიქსი ეკუთვნის** — იმ პრეფიქსიდან, რომელსაც
    #     ყველაზე მეტი წევრი დაუდასტურდა. `GALLERY_CAST_SIZES` ორივეს ხვდება
    #     (`gallery.sizeOption.` 2/3 და `gallery.castSizeOption.` 3/3) და
    #     სწორედ მეორეა ნამდვილი — პირველი ცრუ განგაში იყო.
    candidates = collections.defaultdict(list)

    for prefix, users in sorted(dynamic.items()):
        reachable = set(users) | {dep for u in users for dep in imports.get(u, ())}
        excused = {tail for u in users for tail in local_tails.get(u, ())}

        for members, files in value_sets.items():
            if not (files & reachable):
                continue
            present = [m for m in members if prefix + m in locales["ka.json"]]
            absent = [
                m for m in members if prefix + m not in locales["ka.json"] and m not in excused
            ]
            if len(present) >= 3 and len(present) >= 0.75 * len(members):
                candidates[members].append((len(present), prefix, sorted(files & reachable)[0], absent))

    incomplete = []
    for members, hits in candidates.items():
        best = max(count for count, _p, _f, _a in hits)
        for count, prefix, rel, absent in hits:
            if count == best and absent and (prefix, tuple(absent)) not in KNOWN_GAPS:
                incomplete.append((prefix, rel, absent))

    incomplete.sort()
    problems += len(incomplete)
    print()
    print("incomplete dynamic prefixes: %d" % len(incomplete))
    for prefix, rel, absent in incomplete:
        print(f"    {prefix}* ({rel}) — missing {', '.join(prefix + a for a in absent)}")

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

    # 7. აკრძალული ტერმინი (GAP-15) — სრული ცხრილი `GLOSSARY.md`-შია
    banned = banned_terms(locales["ka.json"])
    problems += len(banned)
    print(f"\nbanned terms in ka.json: {len(banned)}")
    for key, word, correct in banned:
        print(f"    {key}  — {word}... -> {correct}")

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
