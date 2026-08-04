/**
 * Example Bank — repayment estimate.
 *
 * The runtime half of @bank/ui/Calculator@1.1, and the referent for the SELF_CONTAINED
 * verdict: it computes an annuity locally and makes no network request of any kind.
 * There is no fetch in this file and there is not meant to be one.
 *
 * The custom element contract, as Liferay documents it:
 *   - a class extending HTMLElement
 *   - work happens in connectedCallback, not the constructor
 *   - customElements.define guarded by customElements.get, because Liferay may load the
 *     same client extension script more than once on a page
 *
 * Rendered into the light DOM on purpose. cssURLs puts the stylesheet in the document
 * head, so a shadow root would cut the component off from the very CSS the extension
 * ships — and from the portal theme the bank's design system is built on.
 */

const DEFAULTS = {
	annualRatePct: 6.9,
	currency: 'CZK',
	locale: 'cs-CZ',
	principal: 500000,
	principalRange: [50000, 2000000],
	termMonths: 60,
	termMonthsRange: [12, 120],
};

/**
 * Standard annuity. Written out rather than golfed because a bank reviewer reads it:
 * a zero rate is a plain division, not a division by zero.
 */
function monthlyPayment(principal, annualRatePct, termMonths) {
	const r = annualRatePct / 100 / 12;

	if (r === 0) {
		return principal / termMonths;
	}

	return (principal * r) / (1 - Math.pow(1 + r, -termMonths));
}

class RepaymentEstimate extends HTMLElement {
	connectedCallback() {
		// Attribute overrides exist so the bank can drive this from the yaml
		// `properties` block without touching the script. See the README on why this
		// extension does not declare one.
		this.annualRatePct = this.number('annual-rate-pct', DEFAULTS.annualRatePct);
		this.currency = this.getAttribute('currency') ?? DEFAULTS.currency;
		this.locale = this.getAttribute('locale') ?? DEFAULTS.locale;

		this.money = new Intl.NumberFormat(this.locale, {
			currency: this.currency,
			maximumFractionDigits: 0,
			style: 'currency',
		});

		this.render();
	}

	number(attribute, fallback) {
		const raw = Number(this.getAttribute(attribute));

		return Number.isFinite(raw) && raw > 0 ? raw : fallback;
	}

	render() {
		const [minPrincipal, maxPrincipal] = DEFAULTS.principalRange;
		const [minTerm, maxTerm] = DEFAULTS.termMonthsRange;

		this.innerHTML = `
			<section class="eb-repay">
				<h3 class="eb-repay__title">Repayment estimate</h3>

				<label class="eb-repay__field">
					<span class="eb-repay__label">Amount</span>
					<input
						aria-describedby="eb-repay-result"
						class="eb-repay__input"
						max="${maxPrincipal}"
						min="${minPrincipal}"
						name="principal"
						step="10000"
						type="range"
						value="${DEFAULTS.principal}"
					>
					<output class="eb-repay__value" name="principal-value"></output>
				</label>

				<label class="eb-repay__field">
					<span class="eb-repay__label">Term</span>
					<input
						aria-describedby="eb-repay-result"
						class="eb-repay__input"
						max="${maxTerm}"
						min="${minTerm}"
						name="term"
						step="6"
						type="range"
						value="${DEFAULTS.termMonths}"
					>
					<output class="eb-repay__value" name="term-value"></output>
				</label>

				<p aria-live="polite" class="eb-repay__result" id="eb-repay-result">
					<span class="eb-repay__amount" data-role="amount"></span>
					<span class="eb-repay__caption">per month at ${this.annualRatePct}&nbsp;% p.a.</span>
				</p>

				<p class="eb-repay__disclaimer">
					Indicative only. Computed in your browser — this widget sends nothing anywhere.
				</p>
			</section>
		`;

		this.principalInput = this.querySelector('[name="principal"]');
		this.termInput = this.querySelector('[name="term"]');

		const recalculate = () => this.recalculate();

		this.principalInput.addEventListener('input', recalculate);
		this.termInput.addEventListener('input', recalculate);

		this.recalculate();
	}

	recalculate() {
		const principal = Number(this.principalInput.value);
		const termMonths = Number(this.termInput.value);

		this.querySelector('[name="principal-value"]').textContent = this.money.format(principal);
		this.querySelector('[name="term-value"]').textContent = `${termMonths} months`;
		this.querySelector('[data-role="amount"]').textContent = this.money.format(
			monthlyPayment(principal, this.annualRatePct, termMonths)
		);
	}
}

if (!customElements.get('examplebank-repayment-estimate')) {
	customElements.define('examplebank-repayment-estimate', RepaymentEstimate);
}
