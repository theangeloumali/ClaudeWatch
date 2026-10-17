import { companyLens, useCompanyLens } from '../logic/company-lens'
import { BAR_BUTTON_CLASS } from './hud-styles'

// A new bar control, so a 44 px target (A11); the bar's existing buttons keep their size.
export function CompanyLensToggle({ isDisabled = false }: { isDisabled?: boolean }) {
  const isOn = useCompanyLens()
  return (
    <button
      type="button"
      aria-pressed={isOn}
      disabled={isDisabled}
      onClick={companyLens.toggle}
      title="Colour each company's offices in its own hue, with a card per company"
      className={`${BAR_BUTTON_CLASS} min-h-11`}
    >
      Company lens
    </button>
  )
}
