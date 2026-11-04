import React, { useState } from 'react';
import { Button } from '@/components/common/Button/Button';
import { Input } from '@/components/common/Input/Input';
import { Stepper } from '@/components/common/Stepper/Stepper';
import { PRODUCT_POOL } from '@/mocks/campaigns.mock';
import { randomId } from '@/mocks/mockUtils';
import type { AdGroup, Campaign, Keyword, MatchType } from '@/types/advertising.types';

interface CampaignBuilderProps {
  onSubmit: (campaign: Campaign) => void;
  onCancel: () => void;
}

interface AdGroupDraft {
  id: string;
  name: string;
  productIds: string[];
  keywords: Keyword[];
}

const MATCH_TYPES: MatchType[] = ['exact', 'phrase', 'broad'];
const STEPS = ['Campaign Details', 'Ad Groups & Products', 'Keywords & Bids'];

function emptyAdGroup(): AdGroupDraft {
  return { id: randomId('ag'), name: '', productIds: [], keywords: [] };
}

export const CampaignBuilder: React.FC<CampaignBuilderProps> = ({ onSubmit, onCancel }) => {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [dailyBudget, setDailyBudget] = useState(50);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [adGroups, setAdGroups] = useState<AdGroupDraft[]>([emptyAdGroup()]);

  // Draft keyword inputs, keyed by ad group id, so each ad group has its own "add keyword" row.
  const [keywordDrafts, setKeywordDrafts] = useState<Record<string, { text: string; matchType: MatchType; bid: number }>>({});

  const canGoNext = () => {
    if (step === 0) return name.trim().length > 0 && dailyBudget > 0 && startDate.length > 0;
    if (step === 1) return adGroups.length > 0 && adGroups.every((ag) => ag.name.trim().length > 0 && ag.productIds.length > 0);
    return true;
  };

  const updateAdGroup = (id: string, patch: Partial<AdGroupDraft>) => {
    setAdGroups((prev) => prev.map((ag) => (ag.id === id ? { ...ag, ...patch } : ag)));
  };

  const addAdGroup = () => setAdGroups((prev) => [...prev, emptyAdGroup()]);

  const removeAdGroup = (id: string) => setAdGroups((prev) => (prev.length > 1 ? prev.filter((ag) => ag.id !== id) : prev));

  const toggleProduct = (adGroupId: string, productId: string) => {
    setAdGroups((prev) =>
      prev.map((ag) => {
        if (ag.id !== adGroupId) return ag;
        const has = ag.productIds.includes(productId);
        return { ...ag, productIds: has ? ag.productIds.filter((p) => p !== productId) : [...ag.productIds, productId] };
      })
    );
  };

  const getKeywordDraft = (adGroupId: string) =>
    keywordDrafts[adGroupId] ?? { text: '', matchType: 'phrase' as MatchType, bid: 0.5 };

  const setKeywordDraft = (adGroupId: string, patch: Partial<{ text: string; matchType: MatchType; bid: number }>) => {
    setKeywordDrafts((prev) => ({ ...prev, [adGroupId]: { ...getKeywordDraft(adGroupId), ...patch } }));
  };

  const addKeyword = (adGroupId: string) => {
    const draft = getKeywordDraft(adGroupId);
    if (!draft.text.trim() || draft.bid <= 0) return;
    const keyword: Keyword = {
      id: randomId('kw'),
      text: draft.text.trim(),
      matchType: draft.matchType,
      bid: draft.bid,
      impressions: 0,
      clicks: 0,
      spend: 0,
      sales: 0,
    };
    updateAdGroup(adGroupId, { keywords: [...(adGroups.find((ag) => ag.id === adGroupId)?.keywords ?? []), keyword] });
    setKeywordDrafts((prev) => ({ ...prev, [adGroupId]: { text: '', matchType: 'phrase', bid: 0.5 } }));
  };

  const removeKeyword = (adGroupId: string, keywordId: string) => {
    const ag = adGroups.find((a) => a.id === adGroupId);
    if (!ag) return;
    updateAdGroup(adGroupId, { keywords: ag.keywords.filter((k) => k.id !== keywordId) });
  };

  const handleSubmit = () => {
    const finalAdGroups: AdGroup[] = adGroups.map((ag) => ({
      id: ag.id,
      name: ag.name,
      productIds: ag.productIds,
      keywords: ag.keywords,
    }));

    const campaign: Campaign = {
      id: randomId('camp'),
      name: name.trim(),
      status: 'draft',
      dailyBudget,
      startDate,
      endDate: endDate || undefined,
      adGroups: finalAdGroups,
      metrics: { impressions: 0, clicks: 0, spend: 0, sales: 0, acos: 0, roas: 0, ctr: 0 },
      history: [],
    };

    onSubmit(campaign);
  };

  return (
    <div>
      <Stepper steps={STEPS} currentStep={step} />

      {step === 0 && (
        <div>
          <Input label="Campaign Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Holiday Season Boost" />
          <Input
            label="Daily Budget (USD)"
            type="number"
            required
            min={1}
            value={dailyBudget}
            onChange={(e) => setDailyBudget(Number(e.target.value))}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-3)' }}>
            <Input label="Start Date" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Input label="End Date (optional)" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
      )}

      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
          {adGroups.map((ag, idx) => (
            <div key={ag.id} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-2)' }}>
                <strong style={{ fontSize: '0.875rem' }}>Ad Group {idx + 1}</strong>
                {adGroups.length > 1 && (
                  <Button variant="ghost" size="sm" onClick={() => removeAdGroup(ag.id)}>Remove</Button>
                )}
              </div>
              <Input label="Ad Group Name" required value={ag.name} onChange={(e) => updateAdGroup(ag.id, { name: e.target.value })} placeholder="e.g. Electronics Ad Group" />
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 'var(--spacing-2)' }}>Target Products *</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--spacing-2)' }}>
                  {PRODUCT_POOL.map((p) => (
                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', fontSize: '0.8125rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={ag.productIds.includes(p.id)} onChange={() => toggleProduct(ag.id, p.id)} />
                      {p.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ))}
          <Button variant="secondary" onClick={addAdGroup}>+ Add Another Ad Group</Button>
        </div>
      )}

      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
          {adGroups.map((ag) => {
            const draft = getKeywordDraft(ag.id);
            return (
              <div key={ag.id} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-3)' }}>
                <strong style={{ fontSize: '0.875rem', display: 'block', marginBottom: 'var(--spacing-2)' }}>{ag.name || 'Untitled Ad Group'}</strong>

                {ag.keywords.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-1)', marginBottom: 'var(--spacing-3)' }}>
                    {ag.keywords.map((kw) => (
                      <div key={kw.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8125rem', padding: 'var(--spacing-1) var(--spacing-2)', backgroundColor: 'var(--color-surface-muted)', borderRadius: 'var(--radius-sm)' }}>
                        <span>{kw.text} <em style={{ color: 'var(--color-text-secondary)' }}>({kw.matchType})</em> — bid ${kw.bid.toFixed(2)}</span>
                        <button onClick={() => removeKeyword(ag.id, kw.id)} style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', fontSize: '0.75rem' }}>Remove</button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 'var(--spacing-2)', alignItems: 'flex-end' }}>
                  <Input label="Keyword" value={draft.text} onChange={(e) => setKeywordDraft(ag.id, { text: e.target.value })} placeholder="e.g. wireless earbuds" style={{ marginBottom: 0 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-1)', marginBottom: 'var(--spacing-4)' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Match Type</label>
                    <select
                      value={draft.matchType}
                      onChange={(e) => setKeywordDraft(ag.id, { matchType: e.target.value as MatchType })}
                      style={{ padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                    >
                      {MATCH_TYPES.map((mt) => (
                        <option key={mt} value={mt}>{mt.charAt(0).toUpperCase() + mt.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <Input label="Bid ($)" type="number" min={0.01} step={0.01} value={draft.bid} onChange={(e) => setKeywordDraft(ag.id, { bid: Number(e.target.value) })} style={{ marginBottom: 0 }} />
                  <div style={{ marginBottom: 'var(--spacing-4)' }}>
                    <Button variant="secondary" size="sm" onClick={() => addKeyword(ag.id)}>+ Add</Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--spacing-6)' }}>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>
          {step > 0 && <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>Back</Button>}
          {step < STEPS.length - 1 ? (
            <Button variant="primary" onClick={() => setStep((s) => s + 1)} disabled={!canGoNext()}>Next</Button>
          ) : (
            <Button variant="primary" onClick={handleSubmit}>Launch Campaign</Button>
          )}
        </div>
      </div>
    </div>
  );
};
