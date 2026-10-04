<?php

namespace App\Services\Import;

use App\Models\User;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * **Tasks §59.6 — ერთი ჩანაწერის იმპორტი** (რიგის ერთი ნაბიჯი).
 *
 * ⚠️ **ერთეულის ბიჯი და არა მთელი ფაილის ციკლი** (FEAT-07-ის ფორმა):
 * `artisan serve` ერთნაკადიანია — 2000-ჩანაწერიანი ერთი მოთხოვნა მთელ აპს
 * წუთებით გაყინავდა. რიგი თითო ჩანაწერს ცალკე აგზავნის: პროგრესი ჩანს,
 * გაჩერება შეიძლება.
 *
 * ⚠️ **ჩანაწერი ან მთლიანად შემოდის, ან საერთოდ არა** — ერთი ტრანზაქცია
 * ჩანაწერზე და მის „დამატებებზე": კვოტა რომ ფაილზე ამოიწუროს (413), ნახევრად
 * შემოსული ფილმი (პოსტერის გარეშე, მსახიობების ნახევრით) არ რჩება. დისკზე
 * უკვე ჩაწერილ ფაილებს `MediaryFiles::rollback()` შლის.
 *
 * ⚠️ **პასუხი არასდროს 5xx-ია** (`/sync`-ის წესი): ერთი გატეხილი რიგი რიგს
 * არ აჩერებს — `ok: false` + მიზეზი.
 */
class MediaryImporter
{
    public function __construct(
        private readonly MediaryPackage $package,
        private readonly MediaryTargets $targets,
        private readonly MediaryWriter $writer,
        private readonly MediaryExtras $extras,
        private readonly MediaryFiles $files,
    ) {}

    /**
     * @return array{ok: bool, skipped: bool, error: ?string, id: ?int, title: ?string, module: ?string}
     *
     * @throws ImportException `import_expired`
     */
    public function import(User $user, string $token, string $source, int $index): array
    {
        $meta = $this->package->meta($user, $token);
        $info = $meta['modules'][$source] ?? null;

        if (! is_array($info)) {
            return $this->fail('not_found');
        }

        $envelope = (array) ($info['envelope'] ?? []);
        $target = $this->targets->resolve($user, $source, $envelope);

        if ($target['reason'] !== null) {
            return $this->fail($target['reason'], null, $target['module']);
        }

        $module = (string) $target['module'];
        $record = $this->package->record($user, $token, $source, $index);

        if ($record === null) {
            return $this->fail('not_found', null, $module);
        }

        $title = MediaryIdentity::label($module, $record) ?: null;

        if ($reason = ImportPlanner::invalid($module, $record)) {
            return $this->fail($reason, $title, $module);
        }

        // ⚠️ დუბლი თავიდან მოწმდება — გეგმიდან აქამდე შეიძლება დაემატა (ან ურნაში გადავიდა)
        if ($existing = MediaryIdentity::find($user, $module, $record)) {
            /* Tasks §40.1ა — ურნაში მყოფი „ჩავარდნაა" id-ით: რიგი „აღდგენას" სთავაზობს
               ახალი ასლის ნაცვლად (`record_in_trash`-ის საერთო ფორმა) */
            $trashed = (bool) $existing->getAttribute('trashed_at');

            return [
                'ok' => ! $trashed,
                'skipped' => ! $trashed,
                'error' => $trashed ? 'record_in_trash' : null,
                'id' => (int) $existing->getKey(),
                'title' => $title,
                'module' => $module,
            ];
        }

        $zip = $this->package->zip($user, $token);
        $this->files->begin($zip);

        try {
            $model = DB::transaction(function () use ($user, $module, $record, $envelope) {
                $model = $this->writer->create($user, $module, $record, $envelope, $this->files);
                $this->extras->write($user, $module, $model, $record, $envelope, $this->files);

                return $model;
            });
        } catch (HttpResponseException $e) {
            // 17.3 — კვოტა/მოდულის ლიმიტი (413): კოდი რიგამდე აღწევს და ნაკადს აჩერებს
            $this->files->rollback();
            $response = $e->getResponse();

            return $this->fail(
                $response instanceof JsonResponse ? (string) ($response->getData(true)['message'] ?? 'import_failed') : 'import_failed',
                $title,
                $module,
            );
        } catch (Throwable $e) {
            $this->files->rollback();
            report($e);

            return $this->fail('import_failed', $title, $module);
        } finally {
            $zip?->close();
        }

        return ['ok' => true, 'skipped' => false, 'error' => null, 'id' => (int) $model->getKey(), 'title' => $title, 'module' => $module];
    }

    /** @return array{ok: bool, skipped: bool, error: ?string, id: ?int, title: ?string, module: ?string} */
    private function fail(string $error, ?string $title = null, ?string $module = null): array
    {
        return ['ok' => false, 'skipped' => false, 'error' => $error, 'id' => null, 'title' => $title, 'module' => $module];
    }
}
