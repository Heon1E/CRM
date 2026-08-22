import React, { useState } from 'react'
import Modal from '../components/Modal'
import PageLoading from '../components/PageLoading'
import PullToRefresh from '../components/PullToRefresh'

/**
 * 모션 확인 화면 — **개발 중에만 존재한다** (`/__motion`)
 *
 * 왜 만들었나. 모션이 들어가는 자리(모달·시트·스켈레톤·저장 피드백)는 전부
 * 로그인 뒤에 있어서, 확인하려면 매번 로그인·자료 로딩을 거쳐야 했다.
 * 실제로는 그 때문에 **넣어 놓고 한 번도 안 돌려 본 모션이 8곳 넘게** 있었다
 * (`tailwindcss-animate`가 아예 설치돼 있지 않았던 것을 그렇게 놓쳤다).
 *
 * 자료도 로그인도 없이 열리므로, 모션 하나를 고칠 때마다 여기서 바로 본다.
 * 모바일 확인은 브라우저 폭을 390px로 줄이거나 iframe으로 띄우면 된다.
 *
 * **배포 산출물에는 들어가지 않는다.** `App.jsx`가 `import.meta.env.DEV`로
 * 감싸 두었고, 그 밖의 어디에서도 import하지 않는다.
 */
const Swatch = ({ label, hint, children }) => (
    <section className="border border-oem-border rounded-lg bg-white p-4 mb-4">
        <div className="flex items-baseline justify-between gap-3 mb-3">
            <h2 className="text-sm font-bold text-oem-text-primary">{label}</h2>
            <span className="text-xs text-oem-text-secondary">{hint}</span>
        </div>
        {children}
    </section>
)

const MotionLab = () => {
    const [modal, setModal] = useState(null)   // null | 'sm' | 'md' | 'lg'
    const [saving, setSaving] = useState('idle')
    const [skeleton, setSkeleton] = useState(true)

    const fakeSave = () => {
        setSaving('saving')
        setTimeout(() => setSaving('done'), 900)
        setTimeout(() => setSaving('idle'), 2600)
    }

    return (
        <PullToRefresh onRefresh={() => new Promise((r) => setTimeout(r, 1200))}>
        <div className="min-h-screen bg-oem-bg-app p-4 sm:p-8">
            <div className="max-w-3xl mx-auto">
                <header className="mb-6">
                    <h1 className="text-xl font-bold text-oem-text-primary">모션 확인 화면</h1>
                    <p className="text-sm text-oem-text-secondary mt-1">
                        개발 서버에서만 열린다. 폭을 390px로 줄이면 모바일 동작을 그대로 볼 수 있다.
                    </p>
                </header>

                <Swatch label="창(모달) · 시트" hint="모바일=아래에서 올라옴 / 데스크톱=가운데 확대">
                    <div className="flex flex-wrap gap-2">
                        {['sm', 'md', 'lg'].map((s) => (
                            <button key={s} onClick={() => setModal(s)}
                                className="px-4 py-2 rounded bg-oem-blue text-white text-sm font-semibold">
                                {s} 열기
                            </button>
                        ))}
                    </div>
                </Swatch>

                <Swatch label="저장 피드백" hint="눌렀는지 · 되었는지가 눈에 보여야 한다">
                    {/* 색은 토큰으로 준다. `bg-oem-green`은 tailwind 설정에 없어 투명해진다. */}
                    <button onClick={fakeSave} disabled={saving !== 'idle'}
                        style={{ background: saving === 'done' ? 'var(--success)' : undefined }}
                        className={`px-5 py-2 rounded text-sm font-semibold text-white transition-colors
                            ${saving === 'done' ? '' : 'bg-oem-blue'} disabled:opacity-80`}>
                        {saving === 'saving' ? '저장 중…' : saving === 'done' ? '저장됨 ✓' : '저장'}
                    </button>
                </Swatch>

                <Swatch label="스켈레톤" hint="빈 화면 대신 형태를 먼저 보여준다">
                    <button onClick={() => setSkeleton((v) => !v)}
                        className="mb-3 px-3 py-1.5 rounded border border-oem-border text-sm">
                        {skeleton ? '자료 도착' : '다시 불러오는 중으로'}
                    </button>
                    {skeleton ? (
                        <div className="space-y-2">
                            {[0, 1, 2].map((i) => (
                                <div key={i} className="h-12 rounded skeleton" />
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-2 animate-in fade-in duration-200">
                            {['(주)한솔케미칼', '바커케미칼', 'OCI주식회사'].map((n) => (
                                <div key={n} className="h-12 rounded border border-oem-border flex items-center px-3 text-sm">
                                    {n}
                                </div>
                            ))}
                        </div>
                    )}
                </Swatch>

                <Swatch label="화면 전환 중(PageLoading)" hint="실제 화면이 쓰는 그 컴포넌트다">
                    <div className="border border-oem-border rounded overflow-hidden">
                        <div className="-mt-[50px]"><PageLoading /></div>
                    </div>
                </Swatch>

                <Swatch label="거래처 목록 스켈레톤" hint="예전에는 이 자리에 'No Data'가 떠 있었다">
                    <div className="overflow-x-auto">
                        <table className="dgrid min-w-full">
                            <thead className="bg-oem-bg-header">
                                <tr>{['', '번호', '회사명', '담당자', '상태', '최종거래', '누적매출'].map((h, i) => (
                                    <th key={i} className="py-2 px-2 text-left text-xs">{h}</th>))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-oem-border">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <tr key={i}>
                                        {Array.from({ length: 7 }).map((__, c) => (
                                            <td key={c} className="py-2 px-2">
                                                <div className="skeleton h-4 rounded"
                                                    style={{ width: c === 2 ? '80%' : c === 0 ? '18px' : '55%' }} />
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Swatch>

                <Swatch label="이 화면의 애니메이션 이름" hint="'동작 줄이기'를 켜면 전부 0.01ms가 되어야 한다">
                    <div className="flex flex-wrap gap-2 text-xs">
                        {[
                            ['animate-in fade-in', 'fade'],
                            ['animate-in zoom-in-95', 'zoom'],
                            ['animate-in slide-in-from-bottom-6', 'slide'],
                            ['animate-slide-in', 'toast'],
                            ['animate-fade-in', 'tab'],
                        ].map(([cls, label]) => (
                            <span key={cls} data-motion={cls}
                                className={`px-3 py-2 rounded bg-oem-bg-header border border-oem-border ${cls} duration-500`}>
                                {label}
                            </span>
                        ))}
                    </div>
                </Swatch>
            </div>

            <Modal isOpen={!!modal} onClose={() => setModal(null)} size={modal || 'md'} title="창 제목">
                <div className="space-y-3">
                    <p className="text-sm text-oem-text-primary">
                        모바일에서는 아래에서 올라오고, 위쪽에 손잡이가 보인다. Esc로도 닫힌다.
                    </p>
                    <input className="w-full" placeholder="입력칸 (모바일 16px 확인)" />
                    {Array.from({ length: 12 }).map((_, i) => (
                        <p key={i} className="text-sm text-oem-text-secondary">
                            내용이 길면 시트 안에서만 스크롤된다 — {i + 1}
                        </p>
                    ))}
                </div>
            </Modal>
        </div>
        </PullToRefresh>
    )
}

export default MotionLab
