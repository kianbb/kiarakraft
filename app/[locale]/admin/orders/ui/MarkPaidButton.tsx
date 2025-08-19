'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

type Props = { orderId: string }

export default function MarkPaidButton({ orderId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const onClick = async () => {
    if (loading) return
    const ok = window.confirm('Mark this offline payment as PAID? This will decrement stock.')
    if (!ok) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/payments/mark-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ orderId })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to mark payment as PAID')
        return
      }
      router.refresh()
    } catch (e) {
      console.error(e)
      alert('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button size="sm" variant="default" onClick={onClick} disabled={loading}>
      {loading ? 'Marking…' : 'Mark as PAID'}
    </Button>
  )
}
 
