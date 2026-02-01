-- AI 매출 예측 결과 캐싱 테이블
-- Created for 'On-Demand AI Revenue Forecast' feature

CREATE TABLE IF NOT EXISTS public.revenue_forecasts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    forecast_year INTEGER NOT NULL,
    total_amount BIGINT NOT NULL DEFAULT 0,
    monthly_data JSONB NOT NULL DEFAULT '[]'::jsonb,
    growth_rate NUMERIC DEFAULT 0,
    analysis_summary TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 인덱스 추가 (최신 데이터 조회용)
CREATE INDEX IF NOT EXISTS idx_revenue_forecasts_year_created 
ON public.revenue_forecasts (forecast_year, created_at DESC);

-- 코멘트
COMMENT ON TABLE public.revenue_forecasts IS 'Cache table for AI-powered revenue forecasts';
