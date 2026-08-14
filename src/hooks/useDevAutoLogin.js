import { useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'

/**
 * 개발 중 자동 로그인
 *
 * 매번 로그인하느라 작업이 끊기지 않게 한다. 다만 **비밀번호를 저장소에 두면
 * 안 된다** — 이 저장소는 공개돼 있어서 커밋하는 순간 전 세계가 본다.
 * 그래서 값은 `.env.local`(gitignore 대상)에서만 읽고, 코드에는 이름만 둔다.
 *
 *   # .env.local  — 직접 적어 넣을 것. 커밋되지 않는다.
 *   VITE_DEV_AUTOLOGIN_ID=heoniree
 *   VITE_DEV_AUTOLOGIN_PW=<비밀번호>
 *
 * **개발 서버에서만 돈다.** `import.meta.env.DEV`가 false인 배포 빌드에서는
 * 아래 블록이 통째로 잘려 나가므로 아이디/비밀번호가 번들에 들어가지 않는다.
 *
 * 참고: 한 번 로그인하면 Supabase가 세션을 localStorage에 담아 두고 토큰을
 * 알아서 갱신한다. 배포된 앱에서도 로그인은 사실상 한 번만 하면 된다.
 */
export const useDevAutoLogin = () => {
    const { user, loading, signIn } = useAuth()
    const tried = useRef(false)

    useEffect(() => {
        if (!import.meta.env.DEV) return
        if (loading || user || tried.current) return

        const id = import.meta.env.VITE_DEV_AUTOLOGIN_ID
        const pw = import.meta.env.VITE_DEV_AUTOLOGIN_PW
        if (!id || !pw) return

        tried.current = true
        signIn(id, pw).then((r) => {
            if (r.success) console.log('[dev] 자동 로그인:', id)
            else console.warn('[dev] 자동 로그인 실패:', r.error)
        })
    }, [user, loading, signIn])
}

export default useDevAutoLogin
