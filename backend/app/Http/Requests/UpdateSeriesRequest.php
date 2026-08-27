<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateSeriesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'title_ka' => ['nullable', 'string', 'max:255'],
            'title_en' => ['nullable', 'string', 'max:255'],
            'year' => ['nullable', 'integer', 'min:1900', 'max:2100'],
            'imdb_id' => [
                'nullable', 'string', 'regex:/^tt\d+$/',
                Rule::unique('series', 'imdb_id')->ignore($this->route('series')),
            ],
            'ge_url' => ['nullable', 'url', 'max:500'],
            'description_ka' => ['nullable', 'string'],
            'description_en' => ['nullable', 'string'],
            'rating' => ['nullable', 'numeric', 'min:0', 'max:10'],
            'runtime' => ['nullable', 'integer', 'min:1', 'max:1000'],
            'seasons' => ['nullable', 'integer', 'min:1', 'max:1000'],
            'episodes' => ['nullable', 'integer', 'min:1', 'max:100000'],
            'status' => ['nullable', Rule::in(['undecided', 'to_watch', 'watching', 'watched'])],
            'is_favorite' => ['nullable', 'boolean'],
            'genres' => ['nullable', 'array'],
            'genres.*' => ['string', 'max:100'],
            'poster' => ['nullable', 'image', 'max:8192'],
        ];
    }

    public function messages(): array
    {
        return ['imdb_id.unique' => 'ეს სერიალი უკვე დამატებულია (IMDb ID არსებობს).'];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            if (! $this->filled('title_ka') && ! $this->filled('title_en')) {
                $v->errors()->add('title_en', 'სახელი (ქართული ან ინგლისური) აუცილებელია.');
            }
        });
    }
}
