"""ქართული ორთოგრაფიის შემოწმება `ka.json`-ზე (Tasks DEBT-26).

    python scripts/ka-spell.py            # WARN — უცნობ სიტყვებს ბეჭდავს, exit 0
    python scripts/ka-spell.py --strict   # FAIL — უცნობ სიტყვაზე exit 1

რატომ არსებობს: BUG-18-ის ტიპის შეცდომას („ჟანრიის" ×8, „კატეგორიაის" ×2,
„ნიშავს", „სასაათე") **არცერთი** ავტომატური შემოწმება არ იჭერდა — მხოლოდ
თვალით კითხვა. `audit.py` გასაღებებსა და ტერმინოლოგიას იცავს, მართლწერას — არა.

⚠️ **ლექსიკონის არქონა შეცდომა არ არის.** `hunspell`-ის ან მისი `ka_GE`
პაკეტის გარეშე სკრიპტი მიზეზს ბეჭდავს და **0-ს აბრუნებს**: დეველოპერის
მანქანა მის გამო არ უნდა გაწითლდეს და CI-იც არ უნდა ჩავარდეს იმის გამო,
რომ apt-ს პაკეტი არ ჰქონდა.

⚠️ **ნაგულისხმევად WARN და არა FAIL** — ეს გააზრებული ეტაპია: `ka_GE`
ლექსიკონი აპის ლექსიკას (ბუკმარკი, ტეგი, ესკიზი, ფრანჩაიზი…) რამდენად
ფარავს, მხოლოდ ცოცხალ გაშვებაზე ჩანს. სანამ ცრუ დადებითების რიცხვი
გაზომილი არ არის, FAIL ყოველ push-ს დაბლოკავდა და შემოწმება პირველივე
დღეს გამოირთვებოდა. ცნობილი სიტყვები `frontend/src/i18n/ka-words.txt`-შია.
"""
import argparse
import io
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCALE = os.path.join(ROOT, 'frontend', 'src', 'i18n', 'ka.json')
WORDS = os.path.join(ROOT, 'frontend', 'src', 'i18n', 'ka-words.txt')

# ⚠️ **ლექსიკონი რეპოშია და ეს აუცილებლობაა, არა მოხერხებულობა** (2026-09-20).
# `hunspell-ka` პაკეტი **არ არსებობს** — არც Debian-ში, არც Ubuntu-ში; მეტიც,
# `ka_GE.dic`-ის შემცველი პაკეტი მთელ რეპოზიტორიაში არ არის და LibreOffice-ის
# ლექსიკონების კრებულშიც ქართული არ შედის. ე.ი. CI-ის ძველი ნაბიჯი
# (`apt-get install hunspell-ka || true`) ყოველ გაშვებაზე ჩუმად ვარდებოდა და
# შემოწმება **არასდროს გაშვებულა**.
#
# წყარო: `gamag/ka_GE.spell`-ის აგებული გამოსავალი (`wooorm/dictionaries`),
# **MIT** — იხ. `scripts/ka_GE/LICENSE` და `scripts/ka_GE/README.md`.
DICT = os.path.join(ROOT, 'scripts', 'ka_GE', 'ka_GE')

# ⚠️ ინტერპოლაციის სახელი (`{{count}}`) და კოდის ნაჭერი (`` `?view=` ``)
# ინტერფეისის ტექსტი არ არის — `audit.py`-ის მე-10 შემოწმების იგივე წესი.
STRIP = re.compile(r'\{\{[^}]*\}\}|`[^`]*`|<[^>]+>')
# ქართული სიტყვა; დეფისიანი ფორმა (`TMDB-ის`) ცალკე სიტყვებად იშლება
WORD = re.compile(r'[Ⴀ-ჿ]+')


def load_words():
    if not os.path.exists(WORDS):
        return set()
    out = set()
    for line in io.open(WORDS, encoding='utf-8'):
        line = line.split('#', 1)[0].strip()
        if line:
            out.add(line)
    return out


def flat(node, prefix=''):
    for key, value in node.items():
        full = prefix + key
        if isinstance(value, dict):
            for item in flat(value, full + '.'):
                yield item
        else:
            yield full, value


def georgian_words():
    """სიტყვა → რომელ გასაღებებში გვხვდება."""
    data = json.load(io.open(LOCALE, encoding='utf-8'))
    found = {}
    for key, value in flat(data):
        if not isinstance(value, str):
            continue
        for word in WORD.findall(STRIP.sub(' ', value)):
            found.setdefault(word, set()).add(key)
    return found


def dictionary():
    """რომელ ლექსიკონს ვახმარებთ hunspell-ს — ჯერ რეპოსას, მერე სისტემისას."""
    if os.path.exists(DICT + '.dic') and os.path.exists(DICT + '.aff'):
        return DICT

    # ⚠️ fallback მხოლოდ იმისთვისაა, ვისაც სისტემაში თავისი `ka_GE` უდევს;
    # მასზე დაყრდნობა აღარ შეიძლება — ასეთი პაკეტი არსად არ იშოვება.
    return 'ka_GE'


def hunspell_unknown(words):
    """`hunspell -d <ლექსიკონი> -l` → უცნობი სიტყვების სიმრავლე, ან `None`."""
    try:
        proc = subprocess.run(
            ['hunspell', '-d', dictionary(), '-l'],
            input='\n'.join(sorted(words)),
            capture_output=True,
            text=True,
            encoding='utf-8',
        )
    except (OSError, ValueError):
        return None

    # ⚠️ ლექსიკონის არქონა hunspell-ზე **არა-ნულოვანი კოდია** — სწორედ ის
    # შემთხვევა, რომელიც „ყველა სიტყვა უცნობია"-დ არ უნდა წავიკითხოთ.
    if proc.returncode != 0:
        return None

    return {line.strip() for line in proc.stdout.splitlines() if line.strip()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--strict', action='store_true',
                        help='უცნობ სიტყვაზე არა-ნულოვანი კოდი (FAIL)')
    args = parser.parse_args()

    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

    found = georgian_words()
    known = load_words()
    candidates = {w for w in found if w not in known}

    unknown = hunspell_unknown(candidates)

    if unknown is None:
        # ⚠️ ლექსიკონი უკვე რეპოშია, ე.ი. აქ მოხვედრა ახლა **მხოლოდ**
        # `hunspell`-ის ბინარის არქონას ნიშნავს და არა ლექსიკონისას.
        print('hunspell არ არის — შემოწმება გამოტოვებულია (ლექსიკონი რეპოშია).')
        print('  Ubuntu:  sudo apt-get install hunspell')
        print('  Windows: hunspell PATH-ზე უნდა იდგეს; ლექსიკონი — scripts/ka_GE/')
        return 0

    print(f'ქართული სიტყვა: {len(found)} · ცნობილი სიაში: {len(known)} · უცნობი: {len(unknown)}')

    for word in sorted(unknown):
        keys = sorted(found[word])
        print(f'    {word}   ({", ".join(keys[:3])}{"…" if len(keys) > 3 else ""})')

    if unknown and not args.strict:
        print('\n(WARN — სწორი სიტყვა `frontend/src/i18n/ka-words.txt`-ში დაამატე)')

    return 1 if unknown and args.strict else 0


if __name__ == '__main__':
    raise SystemExit(main())
