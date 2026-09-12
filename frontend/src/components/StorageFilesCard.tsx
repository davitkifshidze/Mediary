import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HardDrive } from 'lucide-react'
import {
  deleteStorageFile,
  deleteStorageFiles,
  downloadStorageFiles,
  fetchStorageFiles,
  type StorageScope,
  type UploadedFile,
} from '@/api/account'
import { errorMessage } from '@/lib/errors'
import { formatBytes } from '@/lib/utils'
import { StorageLibrary, type BulkScope } from '@/components/StorageLibrary'
import { useConfirm, useToast } from '@/components/ui/feedback'

/* ============================================================
   **ატვირთული ფაილები (Tasks §6.2)** — პარამეტრებიდან პროფილში.

   „რა ავტვირთე" ანგარიშის ფაქტია და არა პარამეტრი, ამიტომ ბიბლიოთეკა
   `/profile`-ზეა. `/settings`-ს რჩება ის, რაც მართლა პარამეტრია: ლიმიტი,
   მოდულებზე გადანაწილება, გაზრდის მოთხოვნა და ობოლი ფაილები.

   ⚠️ **მასობრივ მოქმედებას სკოუპი ცხადად აქვს** (`მონიშნულები` vs `ყველა`),
   ე.ი. ცარიელი მონიშვნა ვერასდროს ნიშნავს „ყველაფერს" — იგივე წესი, რაც
   `/purge`-ს აქვს. ორივე დასტურს ითხოვს, რადგან წაშლა შეუქცევადია.
   ============================================================ */

export function StorageFilesCard() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const [downloading, setDownloading] = useState(false)

  const filesQ = useQuery({ queryKey: ['storage-files'], queryFn: () => fetchStorageFiles() })

  // წაშლა ერთსა და იმავეს ცვლის — ჯამიც, სიაც და ჰედერის ინდიკატორიც
  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['storage'] })
    qc.invalidateQueries({ queryKey: ['storage-files'] })
    qc.invalidateQueries({ queryKey: ['me'] })
  }

  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const removeOne = useMutation({
    mutationFn: (path: string) => deleteStorageFile(path),
    onSuccess: () => {
      refreshAll()
      toast({ title: t('storage.fileDeleted'), variant: 'success' })
    },
    onError: fail,
  })

  const removeMany = useMutation({
    mutationFn: (scope: StorageScope) => deleteStorageFiles(scope),
    onSuccess: (res) => {
      refreshAll()
      toast({
        title: t('storage.filesDeleted', { count: res.deleted, size: formatBytes(res.freed) }),
        variant: 'success',
      })
    },
    onError: fail,
  })

  const askDeleteOne = async (file: UploadedFile) => {
    const ok = await confirm({
      title: t('storage.fileDeleteTitle'),
      description: t('storage.fileDeleteHint', { name: file.name ?? file.path }),
      confirmText: t('confirm.delete'),
      variant: 'destructive',
    })
    if (ok) removeOne.mutate(file.path)
  }

  const askDeleteMany = async (scope: BulkScope, count: number) => {
    const ok = await confirm({
      title: t('storage.filesDeleteTitle'),
      description:
        scope === 'all'
          ? t('storage.filesDeleteAllHint', { count })
          : t('storage.filesDeleteSelectedHint', { count }),
      confirmText: t('confirm.delete'),
      variant: 'destructive',
    })
    if (ok) removeMany.mutate(scope === 'all' ? { all: true } : { paths: scope.paths })
  }

  const download = async (scope: BulkScope) => {
    setDownloading(true)
    try {
      await downloadStorageFiles(scope === 'all' ? { all: true } : { paths: scope.paths })
    } catch (e) {
      fail(e)
    } finally {
      setDownloading(false)
    }
  }

  const files = filesQ.data?.files ?? []

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          {t('storage.filesTitle')}
        </h2>
        {/* ლიმიტი და მოდულებზე გადანაწილება პარამეტრებში დარჩა — ბმული აქ,
            რომ „სად არის ლიმიტი" ძებნა არ გამოიწვიოს */}
        <Link
          to="/settings"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <HardDrive className="size-3.5" />
          {t('storage.title')}
        </Link>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">{t('storage.filesHint')}</p>

      {filesQ.isLoading ? (
        <div className="h-10 animate-pulse rounded-md bg-muted" />
      ) : (
        <StorageLibrary
          files={files}
          total={filesQ.data?.total}
          bytes={filesQ.data?.bytes}
          moduleTotals={filesQ.data?.modules}
          onDelete={askDeleteOne}
          onBulkDelete={askDeleteMany}
          onBulkDownload={(scope) => download(scope)}
          deletingPath={removeOne.isPending ? removeOne.variables : null}
          busy={removeMany.isPending || downloading}
        />
      )}
    </section>
  )
}
