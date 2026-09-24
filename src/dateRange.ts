// Local-midnight dates; null on either end means unbounded
export interface DateRange {
  from: Date | null
  to: Date | null
}

export const ALL_TIME: DateRange = { from: null, to: null }

// ISO bounds for the API: start of `from` through end of `to`, in local time
export function rangeToQuery(range: DateRange): string {
  const params = new URLSearchParams()
  if (range.from) params.set('since', range.from.toISOString())
  if (range.to) {
    const end = new Date(range.to)
    end.setHours(23, 59, 59, 999)
    params.set('until', end.toISOString())
  }
  const query = params.toString()
  return query ? `&${query}` : ''
}
