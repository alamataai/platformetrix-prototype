import { useState } from 'react'
import { ChevronDown, ChevronRight, AlertTriangle, Tag } from 'lucide-react'
import { useProject } from '../../context/ProjectContext'
import type { TagCleaningRule } from '../../types'
import { splitRawTag } from '../../lib/utils'
import VideoManager from '../setup/VideoManager'
import TagCleaningEditor from '../setup/TagCleaningEditor'

function SectionCard({
  step, title, badge, badgeColor = 'bg-gray-100 text-gray-500',
  defaultOpen = true, children,
}: {
  step: number
  title: string
  badge?: string
  badgeColor?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="flex-none w-6 h-6 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center">
          {step}
        </span>
        <span className="flex-1 text-sm font-semibold text-gray-800">{title}</span>
        {badge !== undefined && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
        )}
        <span className="flex-none text-gray-400">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>
      {open && <div className="border-t border-gray-100">{children}</div>}
    </div>
  )
}

export default function CSVUploader() {
  const { draftConfig, setDraftConfig, csv_library, config, media } = useProject()

  function update(patch: Partial<typeof draftConfig>) {
    setDraftConfig({ ...draftConfig, ...patch })
  }

  function handleMediaChange(media_ids: string[], excluded_media_ids: string[]) {
    // Only included media contribute tags, so excluding (or removing) a video drops its
    // tags from the cleaning list.
    const tags = includedTags(media_ids, excluded_media_ids)
    const tag_cleaning_rules = draftConfig.tag_cleaning_rules.filter(r => tags.has(r.raw_tag))
    setDraftConfig({ ...draftConfig, media_ids, excluded_media_ids, tag_cleaning_rules })
  }

  // Tags from the CSVs attached to the currently *included* media (media_ids minus excluded).
  function includedTags(media_ids: string[], excluded_media_ids: string[]): Set<string> {
    const excluded = new Set(excluded_media_ids)
    const csvIds = new Set(
      media.filter(m => media_ids.includes(m.id) && !excluded.has(m.id))
        .map(m => m.csv_file_id).filter(Boolean) as string[]
    )
    const tags = new Set<string>()
    for (const f of csv_library) {
      if (csvIds.has(f.id)) for (const t of (f.tags ?? [])) tags.add(t)
    }
    return tags
  }

  const csvTags = includedTags(draftConfig.media_ids, draftConfig.excluded_media_ids)
  const knownRawTags = new Set(draftConfig.tag_cleaning_rules.map(r => r.raw_tag))
  const unknownTags = [...csvTags]
    .filter(t => !knownRawTags.has(t))
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))

  const mediaCount = draftConfig.media_ids.length
  const ruleCount = draftConfig.tag_cleaning_rules.length

  function makeRuleFromTag(tag: string): TagCleaningRule {
    const { partner, asset } = splitRawTag(tag)
    // Parseable "Partner – Asset" → mapped; anything else → pending (never auto-excluded).
    const status = partner && asset ? 'mapped' : 'pending'
    return { raw_tag: tag, status, partner, asset, note: null }
  }

  function addUnknownTag(tag: string) {
    setDraftConfig({ ...draftConfig, tag_cleaning_rules: [...draftConfig.tag_cleaning_rules, makeRuleFromTag(tag)] })
  }

  function addAllUnknownTags() {
    if (unknownTags.length === 0) return
    setDraftConfig({ ...draftConfig, tag_cleaning_rules: [...draftConfig.tag_cleaning_rules, ...unknownTags.map(makeRuleFromTag)] })
  }

  function removeAllRules() {
    setDraftConfig({ ...draftConfig, tag_cleaning_rules: [] })
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Step 1 — Media */}
      <SectionCard
        step={1}
        title="Media & Timeslices"
        badge={mediaCount === 0 ? 'No media' : `${mediaCount} item${mediaCount === 1 ? '' : 's'}`}
        badgeColor={mediaCount === 0 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}
      >
        <div className="p-5">
          <VideoManager
            mediaIds={draftConfig.media_ids}
            excludedIds={draftConfig.excluded_media_ids}
            onChange={handleMediaChange}
          />
        </div>
      </SectionCard>

      {/* Step 2 — Tag Cleaning */}
      <SectionCard
        step={2}
        title="Tag Cleaning Rules"
        badge={
          unknownTags.length > 0
            ? `${unknownTags.length} unreviewed`
            : ruleCount > 0
            ? `${ruleCount} rule${ruleCount === 1 ? '' : 's'}`
            : 'No rules'
        }
        badgeColor={
          unknownTags.length > 0
            ? 'bg-amber-100 text-amber-700'
            : ruleCount > 0
            ? 'bg-green-100 text-green-700'
            : 'bg-gray-100 text-gray-500'
        }
        defaultOpen={unknownTags.length > 0 || ruleCount > 0}
      >
        <div className="p-5 space-y-4">
          {unknownTags.length > 0 && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-4">
              <AlertTriangle size={16} className="flex-none text-amber-600 mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-semibold text-amber-800">
                  {unknownTags.length} tag{unknownTags.length === 1 ? '' : 's'} need a cleaning rule
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {unknownTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => addUnknownTag(tag)}
                      className="inline-flex items-center gap-1 text-xs bg-white border border-amber-300 text-amber-800 px-2.5 py-1 rounded-full hover:bg-amber-100 transition-colors"
                    >
                      <Tag size={10} /> {tag}
                    </button>
                  ))}
                </div>
                <button
                  onClick={addAllUnknownTags}
                  className="text-xs font-medium text-amber-700 hover:text-amber-900 hover:underline"
                >
                  Add all with defaults
                </button>
              </div>
            </div>
          )}

          <TagCleaningEditor
            rules={draftConfig.tag_cleaning_rules}
            onChange={rules => update({ tag_cleaning_rules: rules })}
            savedRules={config.tag_cleaning_rules}
            unknownTagCount={unknownTags.length}
            onAddAll={addAllUnknownTags}
            onRemoveAll={removeAllRules}
          />
        </div>
      </SectionCard>
    </div>
  )
}
