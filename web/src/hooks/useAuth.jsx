import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getCapabilities, normalizeRole } from '../lib/roles'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function loadProfile(userId) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      if (error) {
        console.error(error)
        return null
      }
      return data
    }

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      setSession(data.session)
      if (data.session?.user) {
        setProfile(await loadProfile(data.session.user.id))
      }
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next)
      if (next?.user) {
        setProfile(await loadProfile(next.user.id))
      } else {
        setProfile(null)
      }
      setLoading(false)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const role = normalizeRole(profile?.position)
  const caps = useMemo(() => getCapabilities(role), [role])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      role,
      caps,
      async signIn(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        return data.session
      },
      async signOut() {
        const { error } = await supabase.auth.signOut()
        if (error) throw error
      },
      async refreshProfile() {
        if (!session?.user) return null
        const next = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle()
        if (!next.error) setProfile(next.data)
        return next.data
      },
    }),
    [session, profile, loading, role, caps]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
