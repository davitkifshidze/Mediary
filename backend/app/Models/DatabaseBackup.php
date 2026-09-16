<?php

namespace App\Models;

use App\Models\Concerns\StoredFile;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * **ბაზის ერთი დამპი** (Tasks §22).
 *
 * ⚠️ **`StoredFile` და არა ხელით წაშლა.** ტრეიტი ორ გარანტიას იძლევა
 * ერთდროულად — ჩანაწერის წაშლა ფაილს დისკიდანაც შლის და **ჩაწერილ**
 * ბაიტებს კვოტიდან ათავისუფლებს. დამპი ყველაზე დიდი ერთეული ფაილია
 * მთელ აპში, ე.ი. აქ ეს ყველაზე მეტად ეტყობა.
 *
 * ⚠️ **`BelongsToUser` განზრახ არ გამოიყენება.** სიას `super_admin` კითხულობს
 * და `owner` სქოუპი მას **მხოლოდ თავის** დამპებს აჩვენებდა — მაშინ როცა
 * აღდგენა ისედაც მთელ ბაზას ეხება, ე.ი. „ვისია ეს ფაილი" აქ მფლობელობაა
 * (ვის კვოტაზე ზის) და არა ხილვადობის წესი. მისამართი `/admin/*`-შია და
 * უფლებას `super_admin` წყვეტს — ზუსტად ისე, როგორც ობოლების გასუფთავებას.
 */
class DatabaseBackup extends Model
{
    use StoredFile;

    public const STATUS_RUNNING = 'running';

    public const STATUS_READY = 'ready';

    public const STATUS_FAILED = 'failed';

    public const SOURCE_DUMP = 'dump';

    public const SOURCE_UPLOAD = 'upload';

    /**
     * მიტოვებული `running`-ის ზღვარი (§7.1-ის `downloadStale()`-ის წესი).
     *
     * ⚠️ ფონური პროცესი შეიძლება მოკვდეს — ტერმინალი დაიხურა, კომპიუტერი
     * გადაიტვირთა — და `status` სამუდამოდ `running` დარჩეს. ასეთი რიგი
     * ხელშესახები უნდა იყოს, თორემ „მიმდინარეობს" სამუდამოდ ეწერება.
     */
    public const STALE_MINUTES = 60;

    protected $fillable = [
        'user_id',
        'path',
        'name',
        'size',
        'status',
        'error',
        'driver',
        'tables',
        // §11.1 — ცხრილი → [bytes, inserts]; დამპის ერთი გავლიდან
        'table_map',
        'note',
        'source',
        'started_at',
        'finished_at',
    ];

    protected function casts(): array
    {
        return [
            'size' => 'integer',
            'tables' => 'integer',
            // §11.1 — ცხრილი → [bytes, inserts]; იმპორტირებულზე `null`, სანამ არ წაიკითხება
            'table_map' => 'array',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
        ];
    }

    /**
     * მიმდინარეობს, თუ უბრალოდ ასე დარჩა.
     *
     * ⚠️ **`null` საწყისი დრო მიტოვებულად ითვლება** — ეს ან მიგრაციამდელი
     * რიგია, ან ხელით ჩაწერილი, და ორივეზე „სამუდამოდ მიმდინარეობს"
     * მცდარი პასუხია (§7.1-ის იგივე დასკვნა).
     */
    public function stale(): bool
    {
        if ($this->status !== self::STATUS_RUNNING) {
            return false;
        }

        return $this->started_at === null
            || $this->started_at->lt(now()->subMinutes(self::STALE_MINUTES));
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
