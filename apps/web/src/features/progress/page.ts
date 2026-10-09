import { LitElement, css, html, svg, nothing } from 'lit';
import { live } from 'lit/directives/live.js';
import {
  ProgressQuerySchema,
  measurementUnits,
  type ProgressQuery,
  type ProgressResponse,
  type ProgressMetric,
} from '@activus/contracts';
import {
  configurationApi,
  type ProgressApi,
} from '../../services/configuration-api.js';
import { onRestoredPage } from '../../routes/restored-page.js';
import { goalStyles } from '../goals/styles.js';
import { exactNumber, journalDate } from '../journal/format.js';
import { readError } from '../journal/presentation.js';

const periods = [
  ['30d', 'Last 30 days'],
  ['3m', 'Last 3 months'],
  ['12m', 'Last 12 months'],
  ['year', 'This year'],
  ['previous-year', 'Previous year'],
  ['all', 'All time'],
  ['custom', 'Custom range'],
] as const;
type Value = ProgressResponse['summaries'][number]['value'];
export function progressText(metric: ProgressMetric, value: Value): string {
  if (!value) return 'Not recorded';
  if (metric.displayUnit === 'hour-minute') {
    const seconds = BigInt(value.display);
    return `${exactNumber(String(seconds / 3600n))} h ${(seconds % 3600n) / 60n} min ${seconds % 60n} s`;
  }
  const unit = measurementUnits.find((u) => u.id === metric.displayUnit);
  return `${exactNumber(value.display)}${unit ? ` ${unit.symbol}` : ''}`;
}
export class ProgressPage extends LitElement {
  static override properties = {
    api: { attribute: false },
    data: { state: true },
    loading: { state: true },
    error: { state: true },
    filters: { state: true },
  };
  api: ProgressApi = configurationApi;
  private data?: ProgressResponse;
  private loading = true;
  private error?: unknown;
  private filters: ProgressQuery = { period: '12m' };
  private controller?: AbortController;
  private stopRestored?: () => void;
  override connectedCallback() {
    super.connectedCallback();
    const parsed = ProgressQuerySchema.safeParse(
      Object.fromEntries(new URLSearchParams(location.search)),
    );
    if (parsed.success) this.filters = parsed.data;
    this.stopRestored = onRestoredPage(() => void this.load());
    void this.load();
  }
  override disconnectedCallback() {
    this.controller?.abort();
    this.stopRestored?.();
    super.disconnectedCallback();
  }
  private async load() {
    this.controller?.abort();
    const controller = (this.controller = new AbortController());
    this.loading = true;
    this.error = undefined;
    try {
      const data = await this.api.progress(this.filters, controller.signal);
      if (controller.signal.aborted) return;
      this.data = data;
      this.filters = { ...this.filters, metricId: data.metricId };
      history.replaceState(
        history.state,
        '',
        `/progress/trends?${new URLSearchParams(Object.entries(this.filters).filter((e): e is [string, string] => typeof e[1] === 'string'))}`,
      );
    } catch (error) {
      if (!controller.signal.aborted) this.error = error;
    } finally {
      if (!controller.signal.aborted) this.loading = false;
    }
  }
  private change(
    key: 'period' | 'kindId' | 'variantId' | 'metricId',
    event: Event,
  ) {
    const value = (event.target as HTMLSelectElement).value;
    const next = { ...this.filters };
    if (key === 'period') next.period = value as ProgressQuery['period'];
    else if (value) next[key] = value;
    else delete next[key];
    if (key === 'kindId') {
      delete next.variantId;
      delete next.metricId;
    }
    if (key === 'variantId') delete next.metricId;
    if (key === 'period' && value === 'custom') {
      next.startDate = this.data?.range.startDate ?? '';
      next.endDate = this.data?.range.endDate ?? '';
    } else if (key === 'period') {
      delete next.startDate;
      delete next.endDate;
    }
    this.filters = next;
    void this.load();
  }
  private custom(event: SubmitEvent) {
    event.preventDefault();
    const form = new FormData(event.target as HTMLFormElement);
    this.filters = {
      ...this.filters,
      startDate: String(form.get('start')),
      endDate: String(form.get('end')),
    };
    if (!ProgressQuerySchema.safeParse(this.filters).success) {
      this.controller?.abort();
      this.loading = false;
      this.error = new Error(
        'Enter an inclusive range with the end on or after the start.',
      );
      return;
    }
    void this.load();
  }
  private chart(data: ProgressResponse, metric: ProgressMetric) {
    const values = data.trend.map((b) =>
      b.value ? Number(b.value.canonical) : null,
    );
    const recorded = values.filter((v): v is number => v !== null);
    if (!recorded.length)
      return html`<p>
        No recorded ${metric.name.toLowerCase()} in this period.
      </p>`;
    const min = Math.min(0, ...recorded),
      max = Math.max(0, ...recorded);
    const span = max - min || 1;
    const y = (v: number) => 170 - ((v - min) / span) * 145;
    const width = 660 / values.length;
    const x = (i: number) => 70 + (i + 0.5) * width;
    const bars = metric.aggregation === 'total';
    return html`<svg
        viewBox="0 0 760 210"
        role="img"
        aria-label=${`${metric.name} by ${data.grouping}. Exact values are in the trend data table below.`}
      >
        <line class="axis" x1="70" x2="730" y1=${y(0)} y2=${y(0)}></line>
        <text x="4" y="28">${this.axisText(max)}</text>
        <text x="4" y="172">${this.axisText(min)}</text>
        ${values.map((v, i) => (v === null ? nothing : bars ? svg`<rect class="mark" x=${x(i) - width * 0.35} y=${Math.min(y(v), y(0))} width=${Math.max(1, width * 0.7)} height=${Math.max(1, Math.abs(y(v) - y(0)))}><title>${data.trend[i]!.startDate}: ${progressText(metric, data.trend[i]!.value)}</title></rect>` : svg`${i > 0 && values[i - 1] !== null ? svg`<line class="line" x1=${x(i - 1)} y1=${y(values[i - 1]!)} x2=${x(i)} y2=${y(v)}></line>` : nothing}<circle class="mark" cx=${x(i)} cy=${y(v)} r="3"><title>${data.trend[i]!.startDate}: ${progressText(metric, data.trend[i]!.value)}</title></circle>`))}
        <text x="70" y="202">${data.range.startDate}</text>
        <text x="730" y="202" text-anchor="end">${data.range.endDate}</text>
      </svg>
      <p class="muted">
        ${metric.displayUnit ? `Chart scale: ${measurementUnits.find((u) => u.id === metric.displayUnit)?.canonicalUnit ?? metric.displayUnit}. ` : ''}Gaps
        mean no recorded value. Partial boundary buckets use only selected
        dates.
      </p>`;
  }
  private axisText(value: number) {
    return new Intl.NumberFormat(undefined, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  }
  override render() {
    const d = this.data;
    const metric = d?.metrics.find((m) => m.id === d.metricId);
    return html`<header>
        <div>
          <h1>Progress</h1>
          <p class="muted">Totals, trends and records from your journal.</p>
        </div>
      </header>
      <div class="filters">
        <label
          >Period<select
            .value=${live(this.filters.period)}
            @change=${(e: Event) => this.change('period', e)}
          >
            ${periods.map(([id, label]) => html`<option value=${id}>${label}</option>`)}
          </select></label
        >
        <label
          >Activity kind<select
            .value=${live(this.filters.kindId ?? '')}
            @change=${(e: Event) => this.change('kindId', e)}
          >
            <option value="">All activity kinds</option>
            ${d?.kinds.map((k) => html`<option value=${k.id}>${k.name}${k.isArchived ? ' (archived)' : ''}</option>`)}
          </select></label
        >
        ${
          this.filters.kindId && d?.variants.length
            ? html`<label
                >Variant<select
                  ?disabled=${this.loading}
                  .value=${live(this.filters.variantId ?? '')}
                  @change=${(e: Event) => this.change('variantId', e)}
                >
                  <option value="">All variants</option>
                  ${d.variants.map((v) => html`<option value=${v.id}>${v.name}${v.isArchived ? ' (archived)' : ''}</option>`)}
                </select></label
              >`
            : nothing
        }
        <label
          >Metric<select
            ?disabled=${this.loading}
            .value=${live(this.filters.metricId ?? d?.metricId ?? '')}
            @change=${(e: Event) => this.change('metricId', e)}
          >
            ${d?.metrics.map((m) => html`<option value=${m.id}>${m.name}</option>`)}
          </select></label
        >
      </div>
      ${
        this.filters.period === 'custom'
          ? html`<form class="filters custom" @submit=${this.custom}>
              <label
                >From<input
                  name="start"
                  type="date"
                  required
                  min="0001-01-01"
                  max="9999-12-31"
                  .value=${live(this.filters.startDate ?? '')} /></label
              ><label
                >Through<input
                  name="end"
                  type="date"
                  required
                  min="0001-01-01"
                  max="9999-12-31"
                  .value=${live(this.filters.endDate ?? '')} /></label
              ><button type="submit">Apply range</button>
            </form>`
          : nothing
      }
      <p class="announcement" role="status">
        ${this.loading ? 'Loading progress…' : ''}
      </p>
      ${
        this.error
          ? html`<div role="alert">
                ${this.error instanceof Error && this.error.message.startsWith('Enter an inclusive') ? this.error.message : readError(this.error)}
              </div>
              <button @click=${this.load}>Retry</button>`
          : nothing
      }
      ${
        !this.loading && !this.error && d && metric
          ? html`
              <p class="muted">
                ${journalDate(d.range.startDate)} –
                ${journalDate(d.range.endDate)}${d.previousRange ? html`<br />Compared with ${journalDate(d.previousRange.startDate)} – ${journalDate(d.previousRange.endDate)}` : html`<br />All-time view · no previous-period comparison`}
              </p>
              ${d.summaries[0]?.value?.canonical === '0' ? html`<p class="empty">No activities in the selected period. Try another period or activity filter.</p>` : nothing}
              <div class="summaries">
                ${d.summaries.map(
                  (s) =>
                    html`<section>
                      <h2>${s.metric.name}</h2>
                      <p class="value">${progressText(s.metric, s.value)}</p>
                      <p class="muted">
                        ${s.metric.id !== 'count' && s.metric.id !== 'duration' ? `${s.metric.aggregation} of recorded values` : s.metric.id === 'duration' ? 'Recorded duration only' : 'Recorded activities'}
                      </p>
                      ${d.previousRange ? html`<p class="muted">${s.changePercent === null ? 'Comparison unavailable' : Number(s.changePercent) === 0 ? 'No change from previous period' : `${exactNumber(s.changePercent.replace(/^-/, ''))}% ${s.changePercent.startsWith('-') ? 'less' : 'more'} than previous period`}</p>` : nothing}
                    </section>`,
                )}
              </div>
              <section class="trend">
                <h2>${metric.name} over time</h2>
                <p class="muted">
                  ${metric.aggregation} · ${d.grouping} buckets
                </p>
                ${this.chart(d, metric)}
                <details>
                  <summary>View trend data</summary>
                  <div class="table-wrap">
                    <table>
                      <caption>
                        ${metric.name} by ${d.grouping}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Period</th>
                          <th scope="col">${metric.name}</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${d.trend.map(
                          (b) =>
                            html`<tr>
                              <th scope="row">
                                ${b.startDate}${b.startDate !== b.endDate ? ` – ${b.endDate}` : ''}
                              </th>
                              <td>${progressText(metric, b.value)}</td>
                            </tr>`,
                        )}
                      </tbody>
                    </table>
                  </div>
                </details>
              </section>
              <section class="records">
                <h2>Personal records <span class="muted">· All time</span></h2>
                <p class="muted">
                  Up to six records for the selected activities. Ties show the
                  earliest achievement.
                </p>
                ${
                  d.records.length
                    ? html`<ul>
                        ${d.records.map(
                          (r) =>
                            html`<li>
                              <a href=${`/activities/${r.activityId}`}
                                ><span
                                  >${r.metric.name}<strong
                                    >${progressText(r.metric, r.value)}</strong
                                  ><span class="muted"
                                    >${journalDate(r.activityDate)} ·
                                    ${r.kindName}${r.variantName ? ` / ${r.variantName}` : ''}</span
                                  ></span
                                ></a
                              >
                            </li>`,
                        )}
                      </ul>`
                    : html`<p>No eligible personal records yet.</p>`
                }
              </section>
            `
          : nothing
      }`;
  }
  static override styles = [
    ...goalStyles,
    css`
      .filters {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: end;
      }
      label {
        display: grid;
        gap: 4px;
        flex: 1 1 160px;
        font-size: var(--font-size-small);
        min-width: 0;
      }
      select,
      input {
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
      }
      .custom {
        margin-top: 12px;
      }
      .summaries {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr));
        gap: 24px;
        margin: 24px 0;
      }
      .summaries section {
        border-top: 1px solid var(--color-border);
        padding-top: 12px;
      }
      .value {
        font-size: var(--font-size-metric);
        font-weight: 650;
        overflow-wrap: anywhere;
      }
      .trend,
      .records {
        margin-top: 28px;
        border-top: 1px solid var(--color-border);
        padding-top: 12px;
      }
      svg {
        width: 100%;
        display: block;
        height: auto;
      }
      svg text {
        fill: var(--color-text-muted);
        font: 12px var(--font-family);
      }
      .axis {
        stroke: var(--color-border);
      }
      .mark {
        fill: var(--color-chart-1);
      }
      .line {
        stroke: var(--color-chart-1);
        stroke-width: 2;
      }
      summary {
        cursor: pointer;
        padding: 12px 0;
      }
      .table-wrap {
        overflow-x: auto;
        max-height: 320px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: var(--font-size-small);
      }
      th,
      td {
        padding: 8px;
        text-align: left;
        border-bottom: 1px solid var(--color-border);
      }
      ul {
        list-style: none;
        padding: 0;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
        gap: 12px;
      }
      li a {
        text-decoration: none;
        width: 100%;
        box-sizing: border-box;
      }
      li a:hover {
        background: var(--color-surface-subtle);
      }
      li strong,
      li .muted {
        display: block;
        margin-top: 4px;
      }
      h2 .muted {
        font-weight: 400;
      }
    `,
  ];
}
customElements.define('progress-page', ProgressPage);
