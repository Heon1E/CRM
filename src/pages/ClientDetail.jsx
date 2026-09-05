import React, { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useData } from '../contexts/DataContext'
import {
  ArrowLeft,
  Phone,
  Mail,
  Building2,
  Calendar,
  DollarSign,
  Activity,
  MapPin,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react'
import { formatCurrency } from '../utils/formatters'
import { coerceClientStatus } from '../utils/clientStatus'
import { showError } from '../utils/alert'
import ClientDetailPanel from '../components/ClientDetailPanel'

const ClientDetail = () => {
  const { id } = useParams()
  // PC/Mobile page wrapper
  return (
    <div className="md:p-6 bg-oem-bg-app">
      <div className="max-w-[1200px] mx-auto bg-white md:rounded-lg md:shadow-sm overflow-hidden min-h-[800px]">
        <ClientDetailPanel clientId={id} isEmbedded={false} />
      </div>
    </div>
  )
}

export default ClientDetail




