import React from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        // 다음 렌더링에서 폴백 UI가 보이도록 상태를 업데이트 합니다.
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        // 에러 리포팅 서비스에 에러를 기록할 수도 있습니다.
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ error, errorInfo });
    }

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            // 폴백 UI
            return (
                <div className="min-h-screen flex items-center justify-center bg-oem-bg-app font-['Noto_Sans_KR',sans-serif]">
                    <div className="max-w-md w-full bg-white border border-red-200 shadow-lg rounded-sm p-8 text-center">
                        <div className="flex justify-center mb-6">
                            <div className="bg-red-50 p-4 rounded-full">
                                <TriangleAlert className="w-12 h-12 text-red-500" />
                            </div>
                        </div>

                        <h1 className="text-xl font-bold text-gray-900 mb-2 tracking-tight uppercase">
                            System Error Detected
                        </h1>

                        <p className="text-sm text-gray-600 mb-6 leading-relaxed">
                            어플리케이션 실행 중 예기치 않은 오류가 발생했습니다.<br />
                            문제가 지속되면 관리자에게 문의해 주세요.
                        </p>

                        <div className="bg-gray-50 p-3 rounded text-left mb-6 overflow-auto max-h-32 border border-gray-200">
                            <p className="text-[11px] font-mono text-gray-500 break-all">
                                {this.state.error && this.state.error.toString()}
                            </p>
                        </div>

                        <button
                            onClick={this.handleReload}
                            className="w-full bg-oem-blue hover:bg-oem-blue-dark text-white font-bold py-3 px-4 rounded-sm transition-colors flex items-center justify-center gap-2 uppercase text-sm tracking-wide"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Reload Application
                        </button>

                        <p className="mt-4 text-[10px] text-gray-500">
                            Error Code: RENDER_EXCEPTION_0x1
                        </p>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
