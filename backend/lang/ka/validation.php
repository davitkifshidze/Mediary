<?php

/*
|--------------------------------------------------------------------------
| Laravel-ის ვალიდაციის ქართული ტექსტები (Tasks GAP-12)
|--------------------------------------------------------------------------
|
| ⚠️ **ეს არ არის აპლიკაციის შეცდომების თარგმანი.** აპლიკაციის პასუხი
| მანქანური კოდია და მას `frontend/src/lib/errors.ts` თარგმნის (GAP-01-ის
| წესი). აქ მხოლოდ ის ტექსტებია, რომლებსაც **თვითონ Laravel** წერს —
| `required`, `max`, `email`, `unique`… —, და რომლებიც `lang/ka`-ს არქონის
| გამო ქართულ ინტერფეისში ინგლისურად ჩნდებოდა.
|
| ⚠️ **ლოკალს `SetAppLocale` სვამს** `Accept-Language`-ის მიხედვით, რომელსაც
| SPA ყოველ მოთხოვნაზე თავისი `i18n.language`-იდან აგზავნის — ბრაუზერის
| საკუთარი `Accept-Language` აპში არჩეულ ენას არ ასახავს.
|
| ⚠️ **`:attribute` ინგლისურად რჩება** (`title_ka`, `url`, `poster`), რადგან
| ველების სახელების ლექსიკონი უკვე არსებობს ფრონტზე (`fields.name.*`) და
| მისი მეორედ, აქ, დაწერა ორ წყაროს ნიშნავდა. ფორმა შეცდომას ველის გვერდით
| ხატავს, ე.ი. სახელი ისედაც ხილულია.
|
*/

return [

    'accepted' => ':attribute უნდა დაადასტურო.',
    'accepted_if' => ':attribute უნდა დაადასტურო, როცა :other არის :value.',
    'active_url' => ':attribute სწორი მისამართი არ არის.',
    'after' => ':attribute :date-ზე გვიანდელი თარიღი უნდა იყოს.',
    'after_or_equal' => ':attribute :date-ის ტოლი ან მასზე გვიანდელი თარიღი უნდა იყოს.',
    'alpha' => ':attribute მხოლოდ ასოებს უნდა შეიცავდეს.',
    'alpha_dash' => ':attribute მხოლოდ ასოებს, ციფრებს, დეფისსა და ქვედა ტირეს უნდა შეიცავდეს.',
    'alpha_num' => ':attribute მხოლოდ ასოებსა და ციფრებს უნდა შეიცავდეს.',
    'any_of' => ':attribute არასწორია.',
    'array' => ':attribute სია უნდა იყოს.',
    'array_keys' => ':attribute მხოლოდ ამ გასაღებებს უნდა შეიცავდეს: :values.',
    'ascii' => ':attribute მხოლოდ ერთბაიტიან სიმბოლოებს უნდა შეიცავდეს.',
    'base64' => ':attribute სწორი Base64 არ არის.',
    'before' => ':attribute :date-ზე ადრინდელი თარიღი უნდა იყოს.',
    'before_or_equal' => ':attribute :date-ის ტოლი ან მასზე ადრინდელი თარიღი უნდა იყოს.',
    'between' => [
        'array' => ':attribute :min-დან :max ერთეულამდე უნდა შეიცავდეს.',
        'file' => ':attribute :min-დან :max კილობაიტამდე უნდა იყოს.',
        'numeric' => ':attribute :min-სა და :max-ს შორის უნდა იყოს.',
        'string' => ':attribute :min-დან :max სიმბოლომდე უნდა იყოს.',
    ],
    'boolean' => ':attribute დიახ ან არა უნდა იყოს.',
    'can' => ':attribute დაუშვებელ მნიშვნელობას შეიცავს.',
    'confirmed' => ':attribute და მისი გამეორება არ ემთხვევა.',
    'contains' => ':attribute-ს სავალდებულო მნიშვნელობა აკლია.',
    'current_password' => 'პაროლი არასწორია.',
    'date' => ':attribute სწორი თარიღი არ არის.',
    'date_equals' => ':attribute :date-ის ტოლი თარიღი უნდა იყოს.',
    'date_format' => ':attribute :format ფორმატს უნდა ემთხვეოდეს.',
    'decimal' => ':attribute-ს :decimal ათობითი ნიშანი უნდა ჰქონდეს.',
    'declined' => ':attribute უნდა უარყო.',
    'declined_if' => ':attribute უნდა უარყო, როცა :other არის :value.',
    'different' => ':attribute და :other განსხვავებული უნდა იყოს.',
    'digits' => ':attribute :digits ციფრისგან უნდა შედგებოდეს.',
    'digits_between' => ':attribute :min-დან :max ციფრამდე უნდა შედგებოდეს.',
    'dimensions' => ':attribute-ის ზომები არასწორია.',
    'distinct' => ':attribute გამეორებულ მნიშვნელობას შეიცავს.',
    'doesnt_contain' => ':attribute არ უნდა შეიცავდეს: :values.',
    'doesnt_end_with' => ':attribute არ უნდა მთავრდებოდეს ამით: :values.',
    'doesnt_start_with' => ':attribute არ უნდა იწყებოდეს ამით: :values.',
    'email' => ':attribute სწორი ელფოსტა უნდა იყოს.',
    'encoding' => ':attribute :encoding კოდირებით უნდა იყოს.',
    'ends_with' => ':attribute ერთი ამათგანით უნდა მთავრდებოდეს: :values.',
    'enum' => 'არჩეული :attribute არასწორია.',
    'exists' => 'არჩეული :attribute არასწორია.',
    'extensions' => ':attribute-ის გაფართოება ერთი ამათგანი უნდა იყოს: :values.',
    'file' => ':attribute ფაილი უნდა იყოს.',
    'filled' => ':attribute ცარიელი არ უნდა იყოს.',
    'gt' => [
        'array' => ':attribute :value ერთეულზე მეტს უნდა შეიცავდეს.',
        'file' => ':attribute :value კილობაიტზე მეტი უნდა იყოს.',
        'numeric' => ':attribute :value-ზე მეტი უნდა იყოს.',
        'string' => ':attribute :value სიმბოლოზე გრძელი უნდა იყოს.',
    ],
    'gte' => [
        'array' => ':attribute სულ ცოტა :value ერთეულს უნდა შეიცავდეს.',
        'file' => ':attribute სულ ცოტა :value კილობაიტი უნდა იყოს.',
        'numeric' => ':attribute სულ ცოტა :value უნდა იყოს.',
        'string' => ':attribute სულ ცოტა :value სიმბოლო უნდა იყოს.',
    ],
    'hex_color' => ':attribute სწორი თექვსმეტობითი ფერი უნდა იყოს.',
    'image' => ':attribute სურათი უნდა იყოს.',
    'in' => 'არჩეული :attribute არასწორია.',
    'in_array' => ':attribute :other-ში უნდა არსებობდეს.',
    'in_array_keys' => ':attribute სულ ცოტა ერთ ამ გასაღებს უნდა შეიცავდეს: :values.',
    'integer' => ':attribute მთელი რიცხვი უნდა იყოს.',
    'ip' => ':attribute სწორი IP-მისამართი უნდა იყოს.',
    'ipv4' => ':attribute სწორი IPv4-მისამართი უნდა იყოს.',
    'ipv6' => ':attribute სწორი IPv6-მისამართი უნდა იყოს.',
    'json' => ':attribute სწორი JSON უნდა იყოს.',
    'list' => ':attribute სია უნდა იყოს.',
    'lowercase' => ':attribute მხოლოდ პატარა ასოებით უნდა იყოს.',
    'lt' => [
        'array' => ':attribute :value ერთეულზე ნაკლებს უნდა შეიცავდეს.',
        'file' => ':attribute :value კილობაიტზე ნაკლები უნდა იყოს.',
        'numeric' => ':attribute :value-ზე ნაკლები უნდა იყოს.',
        'string' => ':attribute :value სიმბოლოზე მოკლე უნდა იყოს.',
    ],
    'lte' => [
        'array' => ':attribute :value ერთეულზე მეტს არ უნდა შეიცავდეს.',
        'file' => ':attribute :value კილობაიტს არ უნდა აღემატებოდეს.',
        'numeric' => ':attribute :value-ს არ უნდა აღემატებოდეს.',
        'string' => ':attribute :value სიმბოლოს არ უნდა აღემატებოდეს.',
    ],
    'mac_address' => ':attribute სწორი MAC-მისამართი უნდა იყოს.',
    'max' => [
        'array' => ':attribute :max ერთეულზე მეტს არ უნდა შეიცავდეს.',
        'file' => ':attribute :max კილობაიტს არ უნდა აღემატებოდეს.',
        'numeric' => ':attribute :max-ს არ უნდა აღემატებოდეს.',
        'string' => ':attribute :max სიმბოლოს არ უნდა აღემატებოდეს.',
    ],
    'max_digits' => ':attribute :max ციფრზე მეტს არ უნდა შეიცავდეს.',
    'mimes' => ':attribute ერთი ამ ტიპის ფაილი უნდა იყოს: :values.',
    'mimetypes' => ':attribute ერთი ამ ტიპის ფაილი უნდა იყოს: :values.',
    'min' => [
        'array' => ':attribute სულ ცოტა :min ერთეულს უნდა შეიცავდეს.',
        'file' => ':attribute სულ ცოტა :min კილობაიტი უნდა იყოს.',
        'numeric' => ':attribute სულ ცოტა :min უნდა იყოს.',
        'string' => ':attribute სულ ცოტა :min სიმბოლო უნდა იყოს.',
    ],
    'min_digits' => ':attribute სულ ცოტა :min ციფრს უნდა შეიცავდეს.',
    'missing' => ':attribute არ უნდა იყოს გადმოცემული.',
    'missing_if' => ':attribute არ უნდა იყოს გადმოცემული, როცა :other არის :value.',
    'missing_unless' => ':attribute არ უნდა იყოს გადმოცემული, თუ :other არ არის :value.',
    'missing_with' => ':attribute არ უნდა იყოს გადმოცემული, როცა :values არსებობს.',
    'missing_with_all' => ':attribute არ უნდა იყოს გადმოცემული, როცა :values არსებობს.',
    'multiple_of' => ':attribute :value-ის ჯერადი უნდა იყოს.',
    'not_in' => 'არჩეული :attribute არასწორია.',
    'not_regex' => ':attribute-ის ფორმატი არასწორია.',
    'numeric' => ':attribute რიცხვი უნდა იყოს.',
    'password' => [
        'letters' => ':attribute სულ ცოტა ერთ ასოს უნდა შეიცავდეს.',
        'mixed' => ':attribute სულ ცოტა ერთ დიდ და ერთ პატარა ასოს უნდა შეიცავდეს.',
        'numbers' => ':attribute სულ ცოტა ერთ ციფრს უნდა შეიცავდეს.',
        'symbols' => ':attribute სულ ცოტა ერთ სიმბოლოს უნდა შეიცავდეს.',
        'uncompromised' => 'ეს :attribute გაჟონილ მონაცემებში გვხვდება — აირჩიე სხვა.',
    ],
    'present' => ':attribute გადმოცემული უნდა იყოს.',
    'present_if' => ':attribute გადმოცემული უნდა იყოს, როცა :other არის :value.',
    'present_unless' => ':attribute გადმოცემული უნდა იყოს, თუ :other არ არის :value.',
    'present_with' => ':attribute გადმოცემული უნდა იყოს, როცა :values არსებობს.',
    'present_with_all' => ':attribute გადმოცემული უნდა იყოს, როცა :values არსებობს.',
    'prohibited' => ':attribute დაუშვებელია.',
    'prohibited_if' => ':attribute დაუშვებელია, როცა :other არის :value.',
    'prohibited_if_accepted' => ':attribute დაუშვებელია, როცა :other დადასტურებულია.',
    'prohibited_if_declined' => ':attribute დაუშვებელია, როცა :other უარყოფილია.',
    'prohibited_unless' => ':attribute დაუშვებელია, თუ :other არ არის :values-ში.',
    'prohibits' => ':attribute :other-ის გადმოცემას კრძალავს.',
    'regex' => ':attribute-ის ფორმატი არასწორია.',
    'required' => ':attribute აუცილებელია.',
    'required_array_keys' => ':attribute ამ გასაღებებს უნდა შეიცავდეს: :values.',
    'required_if' => ':attribute აუცილებელია, როცა :other არის :value.',
    'required_if_accepted' => ':attribute აუცილებელია, როცა :other დადასტურებულია.',
    'required_if_declined' => ':attribute აუცილებელია, როცა :other უარყოფილია.',
    'required_unless' => ':attribute აუცილებელია, თუ :other არ არის :values-ში.',
    'required_with' => ':attribute აუცილებელია, როცა :values არსებობს.',
    'required_with_all' => ':attribute აუცილებელია, როცა :values არსებობს.',
    'required_without' => ':attribute აუცილებელია, როცა :values არ არსებობს.',
    'required_without_all' => ':attribute აუცილებელია, როცა არცერთი :values არ არსებობს.',
    'same' => ':attribute და :other უნდა ემთხვეოდეს.',
    'size' => [
        'array' => ':attribute :size ერთეულს უნდა შეიცავდეს.',
        'file' => ':attribute :size კილობაიტი უნდა იყოს.',
        'numeric' => ':attribute :size უნდა იყოს.',
        'string' => ':attribute :size სიმბოლო უნდა იყოს.',
    ],
    'starts_with' => ':attribute ერთი ამათგანით უნდა იწყებოდეს: :values.',
    'string' => ':attribute ტექსტი უნდა იყოს.',
    'timezone' => ':attribute სწორი სასაათო სარტყელი უნდა იყოს.',
    'unique' => 'ეს :attribute უკვე დაკავებულია.',
    'uploaded' => ':attribute ვერ აიტვირთა.',
    'uppercase' => ':attribute მხოლოდ დიდი ასოებით უნდა იყოს.',
    'url' => ':attribute სწორი მისამართი უნდა იყოს.',
    'ulid' => ':attribute სწორი ULID უნდა იყოს.',
    'uuid' => ':attribute სწორი UUID უნდა იყოს.',

    'custom' => [],

    'attributes' => [],

];
