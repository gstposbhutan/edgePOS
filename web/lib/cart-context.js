"use client"

import { createContext, useContext, useState, useEffect } from 'react'

const CartContext = createContext()

export function CartProvider({ children }) {
  const [carts, setCarts] = useState([])
  const [loading, setLoading] = useState(false)
  const [itemCount, setItemCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)

  const fetchCart = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/cart')
      if (res.ok) {
        const data = await res.json()
        setCarts(data.carts || [])
        const total = (data.carts || []).reduce((sum, cart) => sum + cart.itemCount, 0)
        setItemCount(total)
      }
    } catch (error) {
      console.error('Error fetching cart:', error)
    } finally {
      setLoading(false)
    }
  }

  const addToCart = async (productId, quantity = 1) => {
    try {
      const res = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, quantity }),
      })
      if (res.ok) {
        await fetchCart()
        return { success: true }
      }
      if (res.status === 401) {
        return { success: false, unauthorized: true }
      }
      const data = await res.json().catch(() => ({}))
      return { success: false, error: data.error || 'Failed to add item' }
    } catch (error) {
      console.error('Error adding to cart:', error)
      return { success: false, error: error.message }
    }
  }

  const updateQuantity = async (itemId, quantity) => {
    try {
      const res = await fetch(`/api/cart/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity }),
      })
      if (res.ok) {
        await fetchCart()
        return true
      }
      return false
    } catch (error) {
      console.error('Error updating cart:', error)
      return false
    }
  }

  const removeItem = async (itemId) => {
    try {
      const res = await fetch(`/api/cart/${itemId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        await fetchCart()
        return true
      }
      return false
    } catch (error) {
      console.error('Error removing item:', error)
      return false
    }
  }

  // Fetch cart on mount and when user logs in
  useEffect(() => {
    fetchCart()
  }, [])

  return (
    <CartContext.Provider
      value={{
        carts,
        loading,
        itemCount,
        isOpen,
        setIsOpen,
        addToCart,
        updateQuantity,
        removeItem,
        fetchCart,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart must be used within CartProvider')
  }
  return context
}
