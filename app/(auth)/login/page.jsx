"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { signIn, ROLE_HOME, getRoleClaims } from "@/lib/auth"

function LoginForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const redirect     = searchParams.get('redirect')

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { user, error: authError } = await signIn(email, password)

    if (authError) {
      setError(authError)
      setLoading(false)
      return
    }

    const { role } = getRoleClaims(user)
    const destination = redirect || ROLE_HOME[role] || '/pos'
    router.push(destination)
  }

  return (
    <div className="w-full max-w-sm mx-4">
      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center mb-4 shadow-lg shadow-primary/30">
          <span className="text-3xl">🏔️</span>
        </div>
        <h1 className="text-2xl font-serif font-bold text-foreground">NEXUS BHUTAN</h1>
        <p className="text-sm text-muted-foreground mt-1">4K Edge-AI POS System</p>
      </div>

      {/* Login card */}
      <Card className="glassmorphism">
        <CardHeader>
          <CardTitle className="text-lg font-serif">Sign In</CardTitle>
          <CardDescription>Enter your credentials to access the system</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Email</label>
              <Input
                type="email"
                placeholder="you@business.bt"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Password</label>
              <div className="relative">
                <Input
                  type={showPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPwd
                    ? <EyeOff className="h-4 w-4" />
                    : <Eye className="h-4 w-4" />
                  }
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 bg-tibetan/10 border border-tibetan/30 rounded-lg">
                <p className="text-xs text-tibetan">{error}</p>
              </div>
            )}

            {/* Submit */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary/90"
            >
              {loading
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in...</>
                : 'Sign In'
              }
            </Button>

            {/* Forgot password */}
            <p className="text-center text-xs text-muted-foreground">
              Forgot your password?{' '}
              <a href="/login/reset" className="text-primary hover:underline underline-offset-4">
                Reset via Email or WhatsApp
              </a>
            </p>
          </form>
        </CardContent>
      </Card>

      {/* Footer */}
      <p className="text-center text-xs text-muted-foreground mt-6">
        © 2026 NEXUS BHUTAN · GST 2026 Compliant
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
