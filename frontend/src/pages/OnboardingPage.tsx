import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { cmToInches, inchesToCm, titleCase } from '@/lib/format'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { AvatarScene } from '@/components/three/AvatarScene'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { ColorField } from '@/components/ui/ColorField'
import { Badge, Notice, Progress } from '@/components/ui/Primitives'
import type { AvatarParameters, MeasurementInput, SizeRecommendation } from '@/lib/types'

const steps = ['Body', 'Measurements', 'Avatar'] as const

interface FormState {
  style_gender: 'womenswear' | 'menswear' | 'unisex'
  height_cm: string
  weight_kg: string
  age: string
  body_shape: string
  measurements: {
    bust_cm: string
    waist_cm: string
    hips_cm: string
    shoulder_cm: string
    inseam_cm: string
    sleeve_cm: string
    shoe_size_eu: string
  }
  skin_tone: string
  hair_color: string
  hair_style: string
  city: string
  country: string
}

const initialForm: FormState = {
  style_gender: 'womenswear',
  height_cm: '168',
  weight_kg: '',
  age: '',
  body_shape: '',
  measurements: {
    bust_cm: '',
    waist_cm: '',
    hips_cm: '',
    shoulder_cm: '',
    inseam_cm: '',
    sleeve_cm: '',
    shoe_size_eu: '',
  },
  skin_tone: '#c99a76',
  hair_color: '#241c18',
  hair_style: 'short',
  city: '',
  country: '',
}

function numberOrNull(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function OnboardingPage() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const refreshUser = useAuthStore((state) => state.refreshUser)

  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormState>(initialForm)
  const [units, setUnits] = useState<'metric' | 'imperial'>('metric')
  const [error, setError] = useState<string | null>(null)

  const toDisplay = (cm: string): string => {
    const value = numberOrNull(cm)
    if (value === null) return ''
    return units === 'metric' ? String(value) : String(cmToInches(value))
  }
  const fromDisplay = (value: string): string => {
    const parsed = numberOrNull(value)
    if (parsed === null) return ''
    return String(units === 'metric' ? parsed : inchesToCm(parsed))
  }

  const update = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }))
  const updateMeasurement = (key: keyof FormState['measurements'], value: string) =>
    setForm((current) => ({
      ...current,
      measurements: { ...current.measurements, [key]: value },
    }))

  const previewPayload = useMemo(
    () => ({
      height_cm: Number(form.height_cm) || 172,
      bust_cm: numberOrNull(form.measurements.bust_cm),
      waist_cm: numberOrNull(form.measurements.waist_cm),
      hips_cm: numberOrNull(form.measurements.hips_cm),
      shoulder_cm: numberOrNull(form.measurements.shoulder_cm),
      inseam_cm: numberOrNull(form.measurements.inseam_cm),
      gender_presentation:
        form.style_gender === 'womenswear'
          ? 'feminine'
          : form.style_gender === 'menswear'
            ? 'masculine'
            : 'neutral',
      preset: 'editorial',
    }),
    [form],
  )

  const preview = useQuery({
    queryKey: ['avatar-preview', previewPayload],
    queryFn: () =>
      api.post<{ parameters: AvatarParameters; measurement_notes: string[] }>(
        '/avatars/preview',
        previewPayload,
      ),
    staleTime: 60_000,
  })

  const hasSizingInput = Boolean(
    form.measurements.bust_cm || form.measurements.waist_cm || form.measurements.hips_cm,
  )
  const recommendation = useQuery({
    queryKey: [
      'size-preview',
      form.style_gender,
      form.measurements.bust_cm,
      form.measurements.waist_cm,
      form.measurements.hips_cm,
    ],
    queryFn: () =>
      api.post<SizeRecommendation>('/profile/size-preview', {
        gender_style: form.style_gender,
        bust_cm: numberOrNull(form.measurements.bust_cm),
        waist_cm: numberOrNull(form.measurements.waist_cm),
        hips_cm: numberOrNull(form.measurements.hips_cm),
      }),
    enabled: hasSizingInput,
    staleTime: 30_000,
  })

  const submit = useMutation({
    mutationFn: () => {
      const measurements: MeasurementInput = {
        unit_system: units,
        bust_cm: numberOrNull(form.measurements.bust_cm),
        waist_cm: numberOrNull(form.measurements.waist_cm),
        hips_cm: numberOrNull(form.measurements.hips_cm),
        shoulder_cm: numberOrNull(form.measurements.shoulder_cm),
        inseam_cm: numberOrNull(form.measurements.inseam_cm),
        sleeve_cm: numberOrNull(form.measurements.sleeve_cm),
        shoe_size_eu: numberOrNull(form.measurements.shoe_size_eu),
      }
      return api.post('/profile/onboarding', {
        style_gender: form.style_gender,
        height_cm: Number(form.height_cm),
        weight_kg: numberOrNull(form.weight_kg),
        age: numberOrNull(form.age),
        body_shape: form.body_shape || null,
        skin_tone: form.skin_tone,
        hair_color: form.hair_color,
        hair_style: form.hair_style,
        city: form.city || null,
        country: form.country || null,
        measurements,
        create_avatar: true,
      })
    },
    onSuccess: async () => {
      await refreshUser()
      toast.success('Your studio is ready', 'Measurements saved and avatar generated.')
      navigate('/fitting-room', { replace: true })
    },
    onError: (caught) => {
      setError(caught instanceof Error ? caught.message : 'Could not save onboarding.')
    },
  })

  const next = () => {
    setError(null)
    if (step === 0) {
      const height = Number(form.height_cm)
      if (!Number.isFinite(height) || height < 120 || height > 230) {
        setError('Enter a height between 120 and 230 cm.')
        return
      }
    }
    if (step < steps.length - 1) setStep(step + 1)
  }

  return (
    <div className="shell py-10">
      <div className="grid min-w-0 gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <div>
            <p className="eyebrow">Onboarding</p>
            <h1 className="display-lg mt-2">Build your fitting profile</h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-muted">
              {user?.full_name.split(' ')[0]}, we need a height and a few measurements to generate
              your avatar and recommend a size. Everything is private and can be edited later.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {steps.map((label, index) => (
              <div key={label} className="flex flex-1 items-center gap-3">
                <span
                  className={`flex size-7 shrink-0 items-center justify-center border text-[0.625rem] ${
                    index <= step ? 'border-ink bg-ink text-paper' : 'border-line text-ink-muted'
                  }`}
                >
                  {index + 1}
                </span>
                <span className={`text-[0.625rem] uppercase tracking-[0.16em] ${index === step ? 'text-ink' : 'text-ink-muted'}`}>
                  {label}
                </span>
              </div>
            ))}
          </div>
          <Progress value={step + 1} max={steps.length} />

          <div className="border border-line bg-bone/40 p-4">
            <p className="label-xs">Method</p>
            <p className="mt-2 text-xs leading-relaxed text-ink-muted">
              The avatar is derived from your measurements with documented anthropometric
              approximations, clamped to plausible ranges. It is an illustration for fitting
              garments, not a body scan or a medical assessment.
            </p>
            {preview.data?.measurement_notes.map((note) => (
              <p key={note} className="mt-2 border-t border-line pt-2 text-xs text-ink-muted">
                {note}
              </p>
            ))}
          </div>

          <div className="border border-line bg-paper p-2">
            <AvatarScene
              parameters={preview.data?.parameters ?? null}
              skinTone={form.skin_tone}
              hairColor={form.hair_color}
              hairStyle={form.hair_style}
              className="aspect-[4/5] w-full"
              showControls={false}
              interactive={step > 0}
            />
          </div>
        </div>

        <div className="border border-line bg-paper p-6 md:p-8">
          {error && (
            <div className="mb-5">
              <Notice tone="warn" title="Check the form">
                {error}
              </Notice>
            </div>
          )}

          {step === 0 && (
            <div className="space-y-5">
              <div>
                <p className="eyebrow">Step one</p>
                <h2 className="display-md mt-1">The basics</h2>
              </div>

              <div>
                <p className="label-xs mb-2">Which catalogue should we open first?</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'womenswear', label: 'Womenswear' },
                    { value: 'menswear', label: 'Menswear' },
                    { value: 'unisex', label: 'Both' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => update({ style_gender: option.value as FormState['style_gender'] })}
                      className={`border px-2 py-3 text-xs uppercase tracking-[0.1em] transition-colors ${
                        form.style_gender === option.value
                          ? 'border-ink bg-ink text-paper'
                          : 'border-line hover:border-ink'
                      }`}
                      aria-pressed={form.style_gender === option.value}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Height"
                  type="number"
                  min={120}
                  max={230}
                  required
                  suffix="cm"
                  value={form.height_cm}
                  onChange={(event) => update({ height_cm: event.target.value })}
                />
                <Input
                  label="Weight (optional)"
                  type="number"
                  min={25}
                  max={300}
                  suffix="kg"
                  value={form.weight_kg}
                  onChange={(event) => update({ weight_kg: event.target.value })}
                  hint="Used only to fine-tune avatar mass."
                />
                <Input
                  label="Age (optional)"
                  type="number"
                  min={13}
                  max={110}
                  value={form.age}
                  onChange={(event) => update({ age: event.target.value })}
                />
                <Select
                  label="Silhouette (optional)"
                  value={form.body_shape}
                  onChange={(event) => update({ body_shape: event.target.value })}
                  options={[
                    { value: '', label: 'Derive from measurements' },
                    { value: 'hourglass', label: 'Hourglass' },
                    { value: 'pear', label: 'Pear' },
                    { value: 'apple', label: 'Apple' },
                    { value: 'rectangle', label: 'Rectangle' },
                    { value: 'inverted_triangle', label: 'Inverted triangle' },
                  ]}
                  hint="Left on auto, we classify from bust / waist / hip."
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow">Step two</p>
                  <h2 className="display-md mt-1">Measurements</h2>
                </div>
                <div className="flex border border-line text-[0.625rem] uppercase tracking-[0.12em]">
                  {(['metric', 'imperial'] as const).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => setUnits(unit)}
                      className={`px-2.5 py-1.5 ${units === unit ? 'bg-ink text-paper' : 'text-ink-muted'}`}
                      aria-pressed={units === unit}
                    >
                      {unit === 'metric' ? 'cm' : 'in'}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-xs leading-relaxed text-ink-muted">
                Measuring over light clothing is most accurate. Only height is required to build an
                avatar; bust/chest, waist and hips enable size recommendations.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    { key: 'bust_cm', label: form.style_gender === 'menswear' ? 'Chest' : 'Bust', min: 40, max: 200 },
                    { key: 'waist_cm', label: 'Waist', min: 35, max: 200 },
                    { key: 'hips_cm', label: 'Hips', min: 45, max: 220 },
                    { key: 'shoulder_cm', label: 'Shoulder width', min: 25, max: 80 },
                    { key: 'inseam_cm', label: 'Inseam', min: 40, max: 120 },
                    { key: 'sleeve_cm', label: 'Sleeve length', min: 30, max: 100 },
                  ] as const
                ).map((field) => (
                  <Input
                    key={field.key}
                    label={field.label}
                    type="number"
                    step="0.5"
                    suffix={units === 'metric' ? 'cm' : 'in'}
                    min={units === 'metric' ? field.min : Number(cmToInches(field.min).toFixed(1))}
                    max={units === 'metric' ? field.max : Number(cmToInches(field.max).toFixed(1))}
                    value={toDisplay(form.measurements[field.key])}
                    onChange={(event) => updateMeasurement(field.key, fromDisplay(event.target.value))}
                  />
                ))}
                <Select
                  label="Shoe size"
                  value={form.measurements.shoe_size_eu}
                  onChange={(event) => updateMeasurement('shoe_size_eu', event.target.value)}
                  options={[
                    { value: '', label: 'Not specified' },
                    ...Array.from({ length: 20 }, (_, index) => {
                      const size = 35 + index
                      return { value: String(size), label: `EU ${size}` }
                    }),
                  ]}
                />
              </div>

              <div className="border-t border-line pt-4 text-xs text-ink-muted">
                {recommendation.data?.available ? (
                  <p>
                    Current recommendation: <strong>{recommendation.data.size?.label}</strong> ·{' '}
                    {recommendation.data.confidence} confidence
                  </p>
                ) : (
                  <p>
                    Size chart: EU/UK/US bands are applied once bust/chest, waist or hips are filled
                    in. You will see the recommendation immediately after saving.
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <p className="eyebrow">Step three</p>
                <h2 className="display-md mt-1">Style your avatar</h2>
              </div>

              <ColorField
                label="Skin tone"
                value={form.skin_tone}
                onChange={(value) => update({ skin_tone: value })}
                swatches={['#f3d3b5', '#e3b48c', '#c99a76', '#a9744f', '#7d5138', '#4f3324', '#33201a']}
              />
              <ColorField
                label="Hair colour"
                value={form.hair_color}
                onChange={(value) => update({ hair_color: value })}
                swatches={['#241c18', '#4a3125', '#8a5a3b', '#c9a06a', '#d9c9b4', '#7d1f2e', '#3a3f4a']}
              />
              <Select
                label="Hair style"
                value={form.hair_style}
                onChange={(event) => update({ hair_style: event.target.value })}
                options={[
                  { value: 'short', label: 'Short' },
                  { value: 'long', label: 'Long' },
                  { value: 'bun', label: 'Bun' },
                  { value: 'braid', label: 'Braid' },
                  { value: 'curly', label: 'Curly' },
                  { value: 'bald', label: 'Bald / shaved' },
                ]}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="City (optional)"
                  value={form.city}
                  onChange={(event) => update({ city: event.target.value })}
                  placeholder="Lahore"
                />
                <Input
                  label="Country (optional)"
                  value={form.country}
                  onChange={(event) => update({ country: event.target.value })}
                  placeholder="Pakistan"
                />
              </div>

              <div className="border border-line bg-bone/50 p-4">
                <p className="label-xs">What happens next</p>
                <ul className="mt-2 space-y-1.5 text-xs text-ink-muted">
                  <li>· Your avatar is generated from these measurements.</li>
                  <li>· A size recommendation is calculated from the standard charts.</li>
                  <li>· You can refine measurements any time in Profile.</li>
                </ul>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone="neutral">{titleCase(form.style_gender)}</Badge>
                  <Badge tone="neutral">{form.height_cm} cm</Badge>
                  {form.measurements.bust_cm && <Badge tone="neutral">Bust {form.measurements.bust_cm} cm</Badge>}
                  {form.measurements.waist_cm && <Badge tone="neutral">Waist {form.measurements.waist_cm} cm</Badge>}
                  {form.measurements.hips_cm && <Badge tone="neutral">Hips {form.measurements.hips_cm} cm</Badge>}
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-5">
            <Button
              variant="ghost"
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0 || submit.isPending}
            >
              Back
            </Button>
            {step < steps.length - 1 ? (
              <Button onClick={next}>Continue</Button>
            ) : (
              <Button onClick={() => submit.mutate()} loading={submit.isPending} size="md">
                Create my avatar
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
