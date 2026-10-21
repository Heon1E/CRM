import React from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { isStaleChunkError, reloadOnceForNewVersion } from '../utils/staleChunk';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        /*
         * **배포 직후 옛 조각 파일 오류는 고장이 아니다.** 새 버전을 받으면 끝난다.
         * 'SYSTEM ERROR'로 덮지 않고 한 번 새로고침한다(`staleChunk.js`).
         * 방금 새로고침했는데 또 나면 그때는 진짜 오류 화면을 보여준다.
         */
        return { hasError: true, updating: isStaleChunkError(error) };
    }

    componentDidCatch(error, errorInfo) {
        // 에러 리포팅 서비스에 에러를 기록할 수도 있습니다.
        console.error("Uncaught error:", error, errorInfo);
        // 새로고침은 여기서 한다(렌더 단계는 부작용이 없어야 한다). 방금 했으면 오류 화면으로.
        const updating = isStaleChunkError(error) && reloadOnceForNewVersion();
        this.setState({ error, errorInfo, updating });
    }

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (this.state.updating) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-oem-bg-app">
                    <p style={{ color: 'var(--text-secondary)' }}>새 버전으로 바꾸는 중입니다…</p>
                </div>
            );
        }
        if (this.state.hasError) {
            // 폴백 UI
            return (
                /* 예전엔 'SYSTEM ERROR DETECTED' · 'RELOAD APPLICATION' · 'Error Code:
                   RENDER_EXCEPTION_0x1' 처럼 영어·개발자 말로 떠서, 폰에서 본 사용자가
                   무엇을 해야 할지 알 수 없었다. 할 일(다시 불러오기)을 먼저, 기술 내용은
                   관리자에게 보여 줄 용도로 아래에 작게. */
                <div className="min-h-screen flex items-center justify-center bg-oem-bg-app px-4">
                    <div className="win max-w-md w-full p-8 text-center">
                        <div className="flex justify-center mb-5">
                            <div className="p-4 rounded-full" style={{ background: 'var(--danger-subtle)' }}>
                                <TriangleAlert className="w-10 h-10 text-[color:var(--danger)]" />
                            </div>
                        </div>

                        <h1 className="text-xl font-extrabold mb-2" style={{ color: 'var(--ind-ink)' }}>
                            화면을 여는 중에 문제가 생겼습니다
                        </h1>

                        <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                            아래 단추로 다시 불러오면 대부분 해결됩니다.<br />
                            계속 같은 화면이 뜨면 관리자에게 알려 주세요.
                        </p>

                        <button onClick={this.handleReload} className="tb-btn primary w-full justify-center" style={{ minHeight: 44 }}>
                            <RefreshCw className="w-4 h-4" />
                            다시 불러오기
                        </button>

                        {this.state.error && (
                            <details className="mt-5 text-left">
                                <summary className="text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                                    관리자에게 보낼 내용
                                </summary>
                                <p className="mt-2 p-3 rounded text-xs break-all overflow-auto max-h-32"
                                    style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                                    {this.state.error.toString()}
                                </p>
                            </details>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
