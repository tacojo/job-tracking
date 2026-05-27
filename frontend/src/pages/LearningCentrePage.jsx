import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { PageHeader, SideNav } from '../components/ui'

function parseTagNames(str) {
  if (!str || typeof str !== 'string') return []
  return str
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function draftOriginLabel(source) {
  if (source === 'ai_generated') return 'AI-generated'
  if (source === 'imported') return 'Imported'
  return 'Your draft'
}

function formatDraftTimestamp(iso) {
  if (!iso) return ''
  try {
    const t = new Date(iso)
    return t.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function sortLibraryRowsByTopicThenUpdated(rows) {
  if (!rows?.length) return []
  return [...rows].sort((a, b) => {
    const ta = (a.source_topic || '').trim() || '\uffff'
    const tb = (b.source_topic || '').trim() || '\uffff'
    const byTopic = ta.localeCompare(tb, undefined, { sensitivity: 'base' })
    if (byTopic !== 0) return byTopic
    const da = new Date(a.updated_at || a.created_at || 0).getTime()
    const db = new Date(b.updated_at || b.created_at || 0).getTime()
    return db - da
  })
}

function tagTextareaRows(s) {
  if (!s || !String(s).trim()) return 3
  const str = String(s)
  const byLine = str.split('\n').length
  const tagCount = str
    .split(/[\n,]+/)
    .map((t) => t.trim())
    .filter(Boolean).length
  return Math.min(24, Math.max(3, Math.max(byLine, Math.ceil(tagCount / 2))))
}

function humanizeSnake(s) {
  if (!s) return ''
  return String(s).replace(/_/g, ' ')
}

const NOTION_LEVELS = ['elementary', 'intermediate', 'expert']

const NOTION_OPTION_HINT = {
  elementary: 'grounding facts you learn early',
  intermediate: 'solid on-the-job and interview scenarios',
  expert: 'edge cases, internals, or rare pitfalls',
}

function coerceNotionLevel(raw) {
  if (!raw) return 'intermediate'
  let s = String(raw).trim().toLowerCase()
  const map = {
    beginner: 'elementary',
    basic: 'elementary',
    foundational: 'elementary',
    mid: 'intermediate',
    medium: 'intermediate',
    advanced: 'expert',
    hard: 'expert',
    senior: 'expert',
  }
  s = map[s] || s
  return NOTION_LEVELS.includes(s) ? s : 'intermediate'
}

function notionLevelHelpTitle(level) {
  const lv = coerceNotionLevel(level)
  if (lv === 'elementary') {
    return 'Elementary — foundations or ideas most learners meet early.'
  }
  if (lv === 'expert') {
    return 'Expert — niche detail, harsh trade-offs, internals, or uncommon failure modes.'
  }
  return 'Intermediate — realistic depth for practising jobs and interviews.'
}

function notionLevelBadgeVisual(level) {
  const lv = coerceNotionLevel(level)
  if (lv === 'elementary')
    return { label: 'Elementary', className: 'bg-success-subtle text-dark border' }
  if (lv === 'expert')
    return { label: 'Expert', className: 'bg-danger-subtle text-dark border' }
  return { label: 'Intermediate', className: 'bg-secondary-subtle text-dark border' }
}

/** Same set as backend `LINK_RELATIONSHIP_TYPES` (schemas/learning.py), sorted for the UI. */
const LINK_RELATIONSHIP_TYPES = [
  'applies_concept',
  'causes',
  'common_mistake_for',
  'contrasts_with',
  'deepens',
  'depends_on',
  'example_of',
  'explains',
  'follow_up_to',
  'mitigates',
  'prerequisite_for',
  'reinforces',
  'related_to',
]

function conceptTypeTitle(t) {
  if (!t) return ''
  const k = String(t).toLowerCase().replace(/\s+/g, '_')
  const hints = {
    design_pattern: 'Design pattern: a reusable structure or approach (not a one-off fact).',
    pattern: 'Pattern: a recurring structure or approach.',
    term: 'Term: vocabulary or a definition worth remembering.',
    principle: 'Principle: a rule or guideline to apply.',
    entity: 'Entity: a named thing (tool, service, concept) the card refers to.',
    process: 'Process: steps or workflow the card is about.',
  }
  return hints[k] || `Concept type from AI extract: “${humanizeSnake(t)}” categorises how this idea fits the card.`
}

function conceptImportanceTitle(i) {
  if (!i) return ''
  const k = String(i).toLowerCase()
  const hints = {
    primary: 'Primary: central to the card — the main idea you are testing.',
    secondary: 'Secondary: supporting detail — useful but not the core answer.',
    tertiary: 'Tertiary: optional depth — extra context.',
  }
  return hints[k] || `Importance from AI extract: “${i}” ranks how central this concept is to the card.`
}

export default function LearningCentrePage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [matches, setMatches] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState(null)

  const [currentItem, setCurrentItem] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(null)
  const [showAnswer, setShowAnswer] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [topicLabelInput, setTopicLabelInput] = useState('')

  const [cardEditing, setCardEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editAnswer, setEditAnswer] = useState('')
  const [editLearningGoal, setEditLearningGoal] = useState('')
  const [editExpectedDepth, setEditExpectedDepth] = useState('')
  const [editCommonMistake, setEditCommonMistake] = useState('')
  const [editExample, setEditExample] = useState('')
  const [editRelatedTo, setEditRelatedTo] = useState('')
  const [editAudience, setEditAudience] = useState('')
  const [editNoteBody, setEditNoteBody] = useState('')
  const [editNotionLevel, setEditNotionLevel] = useState('intermediate')

  const [aiProposal, setAiProposal] = useState(null)
  const [refreshAudience, setRefreshAudience] = useState('')
  const [refreshLoading, setRefreshLoading] = useState(false)

  const [libraryTab, setLibraryTab] = useState('draft')
  const [mainSection, setMainSection] = useState('library')
  const [libraryNotionFilter, setLibraryNotionFilter] = useState('all')
  const [lastGeneratedIds, setLastGeneratedIds] = useState([])
  const [drafts, setDrafts] = useState([])
  const [draftsLoading, setDraftsLoading] = useState(false)
  const [approvedItems, setApprovedItems] = useState([])
  const [approvedLoading, setApprovedLoading] = useState(false)
  const [extractLoading, setExtractLoading] = useState(false)
  const [conceptGraphStats, setConceptGraphStats] = useState(null)
  const [learningGraphDetail, setLearningGraphDetail] = useState(null)
  const [manualEdgeSourceId, setManualEdgeSourceId] = useState('')
  const [manualEdgeTargetId, setManualEdgeTargetId] = useState('')
  const [manualEdgeRelationship, setManualEdgeRelationship] = useState('related_to')
  const [manualEdgeReason, setManualEdgeReason] = useState('')
  const [manualEdgeLoading, setManualEdgeLoading] = useState(false)
  const [exploreConceptId, setExploreConceptId] = useState(null)
  const [explorePayload, setExplorePayload] = useState(null)
  const [exploreLoading, setExploreLoading] = useState(false)
  const [exploreError, setExploreError] = useState(null)
  const exploreFetchSeqRef = useRef(0)

  const exploreDetailMatchesConcept = useMemo(() => {
    if (explorePayload?.concept?.id == null || exploreConceptId == null) return false
    return Number(explorePayload.concept.id) === Number(exploreConceptId)
  }, [explorePayload, exploreConceptId])

  const sortedDrafts = useMemo(() => sortLibraryRowsByTopicThenUpdated(drafts), [drafts])
  const sortedApproved = useMemo(() => sortLibraryRowsByTopicThenUpdated(approvedItems), [approvedItems])

  const mainDraftRows = useMemo(() => {
    if (!lastGeneratedIds.length) return sortedDrafts
    const idSet = new Set(lastGeneratedIds)
    const picked = lastGeneratedIds.map((id) => sortedDrafts.find((d) => d.id === id)).filter(Boolean)
    const rest = sortedDrafts.filter((d) => !idSet.has(d.id))
    return [...picked, ...rest]
  }, [sortedDrafts, lastGeneratedIds])

  const [askMessage, setAskMessage] = useState('')
  const [askLoading, setAskLoading] = useState(false)
  const [askError, setAskError] = useState(null)
  const [askAnswer, setAskAnswer] = useState('')

  const [genTopic, setGenTopic] = useState('')
  const [genAudience, setGenAudience] = useState('')
  const [genNotionLevel, setGenNotionLevel] = useState('intermediate')
  const [genCount, setGenCount] = useState(5)
  const [genLoading, setGenLoading] = useState(false)
  const [genError, setGenError] = useState(null)
  const [genMessage, setGenMessage] = useState(null)

  const [actionMessage, setActionMessage] = useState(null)
  /** Shown next to concepts (not the page-level action line). */
  const [extractConceptsFeedback, setExtractConceptsFeedback] = useState(null)
  const [studyHintsVisible, setStudyHintsVisible] = useState(true)
  const [saveWithGraphEdges, setSaveWithGraphEdges] = useState(true)
  const [saveCardPending, setSaveCardPending] = useState(false)

  const tagRows = useMemo(() => tagTextareaRows(tagInput), [tagInput])

  const cardNavPeers = useMemo(() => {
    if (!currentItem) return { prev: null, next: null }
    const list = currentItem.status === 'draft' ? mainDraftRows : sortedApproved
    const rows = list.map((d) => ({ id: d.id, title: d.title }))
    const idx = rows.findIndex((r) => r.id === currentItem.id)
    if (idx < 0) return { prev: null, next: null }
    return {
      prev: idx > 0 ? rows[idx - 1] : null,
      next: idx < rows.length - 1 ? rows[idx + 1] : null,
    }
  }, [currentItem, mainDraftRows, sortedApproved])

  const hasStudyHintsSection = useMemo(() => {
    if (!currentItem) return false
    return (
      (Array.isArray(currentItem.concepts) && currentItem.concepts.length > 0) ||
      parseTagNames(tagInput).length > 0
    )
  }, [currentItem, tagInput])

  const itemTypeLabel = (t) => {
    if (t === 'flashcard') return 'Flashcard'
    if (t === 'note') return 'Note'
    return t || ''
  }

  const fillEditFromItem = useCallback((item) => {
    if (!item) return
    setEditTitle(item.title || '')
    if (item.type === 'flashcard') {
      const c = item.content || {}
      setEditAnswer(c.answer || '')
      setEditLearningGoal(c.learning_goal || '')
      setEditExpectedDepth(c.expected_depth || '')
      setEditAudience((c.audience ?? '').trim() ? String(c.audience) : '')
      setEditCommonMistake(c.common_mistake || '')
      setEditExample(c.example || '')
      setEditRelatedTo(c.related_to || '')
      setEditNoteBody('')
    } else {
      setEditNoteBody(item.content?.body_markdown || '')
      setEditAnswer('')
      setEditLearningGoal('')
      setEditExpectedDepth('')
      setEditAudience('')
      setEditCommonMistake('')
      setEditExample('')
      setEditRelatedTo('')
    }
    setEditNotionLevel(coerceNotionLevel(item.notion_level))
  }, [])

  const loadDrafts = useCallback(() => {
    setDraftsLoading(true)
    const params =
      libraryNotionFilter === 'all' ? {} : { notion_level: libraryNotionFilter }
    api.learning
      .drafts(params)
      .then(setDrafts)
      .catch(() => setDrafts([]))
      .finally(() => setDraftsLoading(false))
  }, [libraryNotionFilter])

  const loadApprovedItems = useCallback(() => {
    setApprovedLoading(true)
    const params =
      libraryNotionFilter === 'all'
        ? { status: 'approved', limit: 500 }
        : { status: 'approved', limit: 500, notion_level: libraryNotionFilter }
    api.learning
      .listItems(params)
      .then(setApprovedItems)
      .catch(() => setApprovedItems([]))
      .finally(() => setApprovedLoading(false))
  }, [libraryNotionFilter])

  const refreshConceptGraphBrief = useCallback(() => {
    api.learning
      .getGraph()
      .then((g) => {
        const n = g?.nodes?.length ?? 0
        const e = g?.edges?.length ?? 0
        setConceptGraphStats({ nodes: n, edges: e })
      })
      .catch(() => setConceptGraphStats(null))
  }, [])

  const refreshLibrarySidebar = useCallback(() => {
    loadDrafts()
    loadApprovedItems()
    refreshConceptGraphBrief()
  }, [loadDrafts, loadApprovedItems, refreshConceptGraphBrief])

  useEffect(() => {
    loadDrafts()
    loadApprovedItems()
    refreshConceptGraphBrief()
  }, [loadDrafts, loadApprovedItems, refreshConceptGraphBrief])

  useEffect(() => {
    if (libraryTab === 'approved') setLastGeneratedIds([])
  }, [libraryTab])

  useEffect(() => {
    setManualEdgeSourceId('')
    setManualEdgeTargetId('')
    setManualEdgeReason('')
    setManualEdgeRelationship('related_to')
  }, [currentItem?.id])

  useEffect(() => {
    if (!currentItem?.id) {
      setLearningGraphDetail(null)
      return
    }
    api.learning
      .getGraph()
      .then((g) => setLearningGraphDetail({ nodes: g?.nodes ?? [], edges: g?.edges ?? [] }))
      .catch(() => setLearningGraphDetail(null))
  }, [currentItem?.id])

  const openItem = useCallback((id) => {
    setDetailLoading(true)
    setDetailError(null)
    setShowAnswer(false)
    setActionMessage(null)
    setExtractConceptsFeedback(null)
    setExploreConceptId(null)
    setExplorePayload(null)
    setExploreError(null)
    api.learning
      .getItem(id)
      .then((item) => {
        setCurrentItem(item)
        setMainSection('library')
        setLibraryTab(item.status === 'draft' ? 'draft' : 'approved')
        setTagInput((item.tags || []).map((t) => t.name).join('\n'))
        setTopicLabelInput(item.source_topic || '')
        setCardEditing(false)
        setAiProposal(null)
        fillEditFromItem(item)
        setStudyHintsVisible(item.status !== 'approved')
      })
      .catch((e) => setDetailError(e.message || 'Failed to load card'))
      .finally(() => setDetailLoading(false))
  }, [fillEditFromItem])

  const goBack = useCallback(() => {
    setCurrentItem(null)
    setShowAnswer(false)
    setDetailError(null)
    setTopicLabelInput('')
    setCardEditing(false)
    setAiProposal(null)
    setExtractConceptsFeedback(null)
    setExploreConceptId(null)
    setExplorePayload(null)
    setExploreError(null)
  }, [])

  const leaveCardForLibraryTab = useCallback((tab) => {
    setCurrentItem(null)
    setShowAnswer(false)
    setDetailError(null)
    setTopicLabelInput('')
    setCardEditing(false)
    setAiProposal(null)
    setActionMessage(null)
    setExtractConceptsFeedback(null)
    setExploreConceptId(null)
    setExplorePayload(null)
    setExploreError(null)
    setMainSection('library')
    setLibraryTab(tab)
  }, [])

  const runSearchWithQuery = useCallback((rawQuery) => {
    const q = String(rawQuery ?? '').trim()
    if (!q) return
    setSearchQuery(q)
    setCurrentItem(null)
    setShowAnswer(false)
    setDetailError(null)
    setTopicLabelInput('')
    setCardEditing(false)
    setAiProposal(null)
    setActionMessage(null)
    setMainSection('library')
    setLibraryTab('approved')
    setSearchLoading(true)
    setSearchError(null)
    api.learning
      .search(q)
      .then((r) => setMatches(r.matches || []))
      .catch((err) => setSearchError(err.message || 'Search failed'))
      .finally(() => setSearchLoading(false))
  }, [])

  const runSearch = (e) => {
    e?.preventDefault?.()
    runSearchWithQuery(searchQuery)
  }

  const saveTags = () => {
    if (!currentItem) return
    const names = parseTagNames(tagInput)
    api.learning
      .patchItem(currentItem.id, { tag_names: names })
      .then((item) => {
        setCurrentItem(item)
        setTagInput((item.tags || []).map((t) => t.name).join('\n'))
        setActionMessage('Tags saved.')
      })
      .catch((e) => setActionMessage(e.message || 'Could not save tags'))
  }

  const saveCardEdits = () => {
    if (!currentItem) return
    const title = editTitle.trim()
    if (!title) {
      setActionMessage('Title is required.')
      return
    }
    let content
    if (currentItem.type === 'flashcard') {
      const ans = editAnswer.trim()
      if (!ans) {
        setActionMessage('Answer is required for a flashcard.')
        return
      }
      content = {
        answer: ans,
        learning_goal: editLearningGoal.trim() || null,
        expected_depth: editExpectedDepth.trim() || null,
        audience: editAudience.trim() || null,
        common_mistake: editCommonMistake.trim() || null,
        example: editExample.trim() || null,
        related_to: editRelatedTo.trim() || null,
      }
    } else {
      const body = editNoteBody.trim()
      if (!body) {
        setActionMessage('Note body is required.')
        return
      }
      content = { body_markdown: body }
    }
    setSaveCardPending(true)
    api.learning
      .patchItem(currentItem.id, { title, content, notion_level: editNotionLevel, extract_graph_edges: saveWithGraphEdges })
      .then((item) => {
        setCurrentItem(item)
        fillEditFromItem(item)
        setCardEditing(false)
        const msg = saveWithGraphEdges
          ? 'Card saved. If concepts are linked to this card, graph edges may have been suggested (AI).'
          : 'Card saved.'
        setActionMessage(msg)
        if (item.status === 'draft') loadDrafts()
        else loadApprovedItems()
        refreshConceptGraphBrief()
        if (exploreConceptId != null) {
          api.learning
            .getConceptExplore(exploreConceptId)
            .then((data) => setExplorePayload(data))
            .catch(() => {})
        }
        api.learning
          .getGraph()
          .then((g) => setLearningGraphDetail({ nodes: g?.nodes ?? [], edges: g?.edges ?? [] }))
          .catch(() => {})
      })
      .catch((e) => setActionMessage(e.body?.detail || e.message || 'Could not save card'))
      .finally(() => setSaveCardPending(false))
  }

  const deleteCurrentCard = () => {
    if (!currentItem) return
    if (
      !window.confirm(
        `Delete this card?\n\n“${currentItem.title.slice(0, 80)}${currentItem.title.length > 80 ? '…' : ''}”`,
      )
    ) {
      return
    }
    api.learning
      .deleteItem(currentItem.id)
      .then(() => {
        setActionMessage(null)
        refreshLibrarySidebar()
        goBack()
      })
      .catch((e) => setActionMessage(e.body?.detail || e.message || 'Delete failed'))
  }

  const runAiRefreshPreview = () => {
    if (!currentItem) return
    setRefreshLoading(true)
    setActionMessage(null)
    api.learning
      .aiRefreshItem(currentItem.id, {
        apply: false,
        audience: refreshAudience.trim() || null,
      })
      .then((r) => {
        setAiProposal({
          title: r.proposal_title,
          content: r.proposal_content,
          notion_level: r.proposal_notion_level ?? null,
        })
        setActionMessage('AI suggestion is ready — save as-is, edit first, or discard.')
      })
      .catch((e) => setActionMessage(e.body?.detail || e.message || 'AI refresh failed'))
      .finally(() => setRefreshLoading(false))
  }

  const saveAiProposalAsReturned = () => {
    if (!currentItem || !aiProposal?.title || !aiProposal?.content) return
    setSaveCardPending(true)
    const patch = {
      title: aiProposal.title,
      content: aiProposal.content,
      extract_graph_edges: saveWithGraphEdges,
    }
    if (
      currentItem.type === 'flashcard' &&
      aiProposal.notion_level &&
      NOTION_LEVELS.includes(aiProposal.notion_level)
    ) {
      patch.notion_level = aiProposal.notion_level
    }
    api.learning
      .patchItem(currentItem.id, patch)
      .then((item) => {
        setCurrentItem(item)
        setTagInput((item.tags || []).map((t) => t.name).join('\n'))
        fillEditFromItem(item)
        setAiProposal(null)
        setCardEditing(false)
        setShowAnswer(true)
        setActionMessage('Card updated from AI.')
        if (item.status === 'draft') loadDrafts()
        else loadApprovedItems()
        refreshConceptGraphBrief()
        api.learning
          .getGraph()
          .then((g) => setLearningGraphDetail({ nodes: g?.nodes ?? [], edges: g?.edges ?? [] }))
          .catch(() => {})
      })
      .catch((e) => setActionMessage(e.body?.detail || e.message || 'Could not save'))
      .finally(() => setSaveCardPending(false))
  }

  const putAiProposalInEditor = () => {
    if (!aiProposal?.content) return
    setEditTitle(aiProposal.title || '')
    if (currentItem?.type === 'flashcard') {
      const c = aiProposal.content
      setEditAnswer(c.answer || '')
      setEditLearningGoal(c.learning_goal || '')
      setEditExpectedDepth(c.expected_depth || '')
      setEditAudience((c.audience ?? '').trim() ? String(c.audience) : '')
      setEditCommonMistake(c.common_mistake || '')
      setEditExample(c.example || '')
      setEditRelatedTo(c.related_to || '')
      setEditNoteBody('')
      if (aiProposal.notion_level && NOTION_LEVELS.includes(aiProposal.notion_level)) {
        setEditNotionLevel(aiProposal.notion_level)
      }
      setShowAnswer(true)
    } else {
      setEditNoteBody(aiProposal.content.body_markdown || '')
      setEditAnswer('')
      setEditLearningGoal('')
      setEditExpectedDepth('')
      setEditAudience('')
      setEditCommonMistake('')
      setEditExample('')
      setEditRelatedTo('')
    }
    setCardEditing(true)
    setAiProposal(null)
    setActionMessage('Edit the suggestion, then click Save card.')
  }

  const saveTopicLabel = () => {
    if (!currentItem) return
    const v = topicLabelInput.trim()
    api.learning
      .patchItem(currentItem.id, { source_topic: v || null })
      .then((item) => {
        setCurrentItem(item)
        setTopicLabelInput(item.source_topic || '')
        setActionMessage('Topic / session saved.')
        if (item.status === 'draft') loadDrafts()
        else loadApprovedItems()
      })
      .catch((e) => setActionMessage(e.message || 'Could not save topic'))
  }

  const approveCurrent = () => {
    if (!currentItem) return
    api.learning
      .approveItem(currentItem.id)
      .then((item) => {
        setCurrentItem(item)
        setLibraryTab('approved')
        setStudyHintsVisible(false)
        setActionMessage('Approved — card is now in your saved corpus.')
        refreshLibrarySidebar()
      })
      .catch((e) => setActionMessage(e.message || 'Approve failed'))
  }

  const sendAsk = () => {
    const msg = askMessage.trim()
    if (!msg) return
    setAskLoading(true)
    setAskError(null)
    setAskAnswer('')
    api.learning
      .askAI({
        message: msg,
        context_item_id: currentItem?.id ?? null,
      })
      .then((r) => setAskAnswer(r.answer || ''))
      .catch((e) => setAskError(e.body?.detail || e.message || 'Ask failed'))
      .finally(() => setAskLoading(false))
  }

  const runGenerate = () => {
    const topic = genTopic.trim()
    if (!topic) return
    setGenLoading(true)
    setGenError(null)
    setGenMessage(null)
    setLastGeneratedIds([])
    api.learning
      .generateFlashcards({
        topic,
        audience: genAudience.trim() || null,
        target_notion_level: coerceNotionLevel(genNotionLevel),
        count: Number(genCount) || 5,
      })
      .then((r) => {
        const ids = (r.items || []).map((i) => i.id)
        setLastGeneratedIds(ids)
        const n = ids.length
        setGenMessage(
          `Saved ${n} draft flashcard(s). They're listed below (newest batch first in Draft). Open one to review or approve.`,
        )
        setMainSection('library')
        setLibraryTab('draft')
        loadDrafts()
      })
      .catch((e) => setGenError(e.body?.detail || e.message || 'Generate failed'))
      .finally(() => setGenLoading(false))
  }

  const runExtractConcepts = () => {
    if (!currentItem) return
    setExtractLoading(true)
    setExtractConceptsFeedback(null)
    api.learning
      .extractConceptsWithAI(currentItem.id, { apply: true, apply_links: true })
      .then((payload) => {
        const item = payload.item
        if (item) setCurrentItem(item)
        setTagInput((item?.tags || []).map((t) => t.name).join('\n'))
        const nConcepts = payload.concepts?.length ?? item?.concepts?.length ?? 0
        const nRels = payload.relationships?.length ?? 0
        setExtractConceptsFeedback({
          ok: true,
          text: `Extract concepts (AI): ${nConcepts} concept(s) on this card; ${nRels} suggested graph edge(s). Broad tags from the model are merged into your tags when present.`,
        })
        refreshLibrarySidebar()
        api.learning
          .getGraph()
          .then((g) => setLearningGraphDetail({ nodes: g?.nodes ?? [], edges: g?.edges ?? [] }))
          .catch(() => {})
      })
      .catch((e) =>
        setExtractConceptsFeedback({
          ok: false,
          text: e.body?.detail || e.message || 'Extract concepts failed',
        }),
      )
      .finally(() => setExtractLoading(false))
  }

  const createManualConceptEdge = () => {
    const src = Number(manualEdgeSourceId)
    const tgt = Number(manualEdgeTargetId)
    if (!currentItem || !src || !tgt || src === tgt) {
      setActionMessage('Pick two different concepts and a relationship type.')
      return
    }
    if (!manualEdgeRelationship) {
      setActionMessage('Pick a relationship type.')
      return
    }
    setManualEdgeLoading(true)
    api.learning
      .createConceptRelationship({
        source_concept_id: src,
        target_concept_id: tgt,
        relationship: manualEdgeRelationship,
        reason: manualEdgeReason.trim(),
      })
      .then((r) => {
        setActionMessage(r?.created === false ? 'That edge already exists.' : 'Graph edge created.')
        refreshConceptGraphBrief()
        return api.learning.getGraph()
      })
      .then((g) => {
        setLearningGraphDetail({ nodes: g?.nodes ?? [], edges: g?.edges ?? [] })
        if (exploreConceptId != null) {
          openConceptExplore(exploreConceptId)
        }
      })
      .catch((e) => setActionMessage(e.body?.detail || e.message || 'Could not create edge'))
      .finally(() => setManualEdgeLoading(false))
  }

  const openConceptExplore = useCallback((conceptId) => {
    if (!conceptId) return
    const seq = ++exploreFetchSeqRef.current
    const id = Number(conceptId)
    setExploreConceptId(id)
    setExploreLoading(true)
    setExploreError(null)
    api.learning
      .getConceptExplore(id)
      .then((data) => {
        if (exploreFetchSeqRef.current !== seq) return
        setExplorePayload(data)
        setExploreError(null)
      })
      .catch((e) => {
        if (exploreFetchSeqRef.current !== seq) return
        setExploreError(e.body?.detail || e.message || 'Could not load concept')
        setExplorePayload(null)
      })
      .finally(() => {
        if (exploreFetchSeqRef.current !== seq) return
        setExploreLoading(false)
      })
  }, [])

  const closeConceptExplore = useCallback(() => {
    exploreFetchSeqRef.current += 1
    setExploreConceptId(null)
    setExplorePayload(null)
    setExploreError(null)
    setExploreLoading(false)
  }, [])

  const openLinkedItemFromExplore = useCallback(
    (itemId) => {
      closeConceptExplore()
      openItem(itemId)
    },
    [closeConceptExplore, openItem],
  )

  const navAskActive = !currentItem && mainSection === 'ask'
  const navGenerateActive = !currentItem && mainSection === 'generate'
  const navLibraryDraftActive =
    (!currentItem && mainSection === 'library' && libraryTab === 'draft') ||
    (currentItem && currentItem.status === 'draft')
  const navLibraryApprovedActive =
    (!currentItem && mainSection === 'library' && libraryTab === 'approved') ||
    (currentItem && currentItem.status === 'approved')

  const goToAsk = () => {
    goBack()
    setMainSection('ask')
  }
  const goToGenerate = () => {
    goBack()
    setMainSection('generate')
  }
  const goToLibraryDraft = () => {
    leaveCardForLibraryTab('draft')
  }
  const goToLibraryApproved = () => {
    leaveCardForLibraryTab('approved')
  }

  const recordReview = (ease) => {
    if (!currentItem) return
    api.learning
      .reviewItem(currentItem.id, ease)
      .then(() => setActionMessage(`Logged “${ease}” (SRS scheduling comes in a later version).`))
      .catch((e) => setActionMessage(e.body?.detail || e.message || 'Review failed'))
  }

  const renderAskPanel = (mode) => {
    const isMain = mode === 'main'
    const textRows = 3
    return (
      <div id={mode === 'card' ? 'learning-ask-panel' : undefined} className="learning-ai-follow-up-panel">
        <p className={`small text-muted mb-2${isMain ? '' : ' learning-ai-follow-up-intro'}`}>
          {isMain ? (
            'Open a card from the library to include it automatically, or ask a general question.'
          ) : (
            <>
              Uses this card as extra context.
              <br />
              Type your question below, then read the model's answer — the card stays unchanged until you save your
              own edits.
            </>
          )}
        </p>
        <textarea
          className="form-control mb-2"
          rows={textRows}
          value={askMessage}
          onChange={(e) => setAskMessage(e.target.value)}
          placeholder="What would you like explained?"
        />
        <button type="button" className="btn btn-primary btn-sm" disabled={askLoading} onClick={sendAsk}>
          {askLoading ? 'Thinking…' : 'Ask AI'}
        </button>
        {askError && <p className="text-danger small mt-2 mb-0">{askError}</p>}
        {askAnswer && (
          <div className="border rounded p-2 mt-2 small" style={{ whiteSpace: 'pre-wrap' }}>
            {askAnswer}
          </div>
        )}
      </div>
    )
  }

  const renderLibraryRow = (d, { isDraftList }) => {
    const when = formatDraftTimestamp(d.updated_at || d.created_at)
    const isNewBatch = isDraftList && lastGeneratedIds.includes(d.id)
    const nl = notionLevelBadgeVisual(d.notion_level)
    return (
      <li key={d.id} className="list-group-item py-2">
        <div className="d-flex flex-column gap-1 align-items-start">
          <div className="d-flex flex-wrap align-items-center gap-2 w-100">
            <button
              type="button"
              className="btn btn-link btn-sm p-0 text-start fw-medium flex-grow-1"
              onClick={() => openItem(d.id)}
            >
              {d.title}
            </button>
            <span
              className={`badge rounded-pill ${nl.className} flex-shrink-0`}
              title={notionLevelHelpTitle(d.notion_level)}
            >
              {nl.label}
            </span>
            {isNewBatch ? (
              <span className="badge bg-info text-dark">This batch</span>
            ) : null}
          </div>
          <div className="small text-muted w-100">
            <span>{draftOriginLabel(d.source)}</span>
            {d.source_topic ? (
              <>
                <span className="mx-1">·</span>
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0 text-start align-baseline text-body-secondary"
                  title="Search saved cards for this topic"
                  onClick={() => runSearchWithQuery(d.source_topic)}
                >
                  {d.source_topic}
                </button>
              </>
            ) : null}
            {when ? (
              <>
                <span className="mx-1">·</span>
                <span>{when}</span>
              </>
            ) : null}
          </div>
        </div>
      </li>
    )
  }

  return (
    <>
      <PageHeader title="Learning" subtitle="Retrieval-first flashcards — search saved cards, draft with AI, then approve." />

      <div className="row g-4">
        <div className="col-lg-3 col-md-4">
          <div className="card learning-left-nav">
            <div className="card-body p-2">
              <SideNav aria-label="Learning sections">
                <SideNav.Item active={navAskActive} onClick={goToAsk}>
                  Ask AI
                </SideNav.Item>
                <SideNav.Item active={navGenerateActive} onClick={goToGenerate}>
                  Generate draft
                </SideNav.Item>
                <SideNav.Label>Library</SideNav.Label>
                <SideNav.Item indent active={navLibraryDraftActive} onClick={goToLibraryDraft}>
                  Draft ({drafts.length})
                </SideNav.Item>
                <SideNav.Item indent active={navLibraryApprovedActive} onClick={goToLibraryApproved}>
                  Approved ({approvedItems.length})
                </SideNav.Item>
              </SideNav>
              <div className="border-top pt-2 mt-2">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm w-100"
                onClick={refreshLibrarySidebar}
                disabled={draftsLoading || approvedLoading}
              >
                {draftsLoading || approvedLoading ? 'Refreshing…' : 'Refresh lists'}
              </button>
              {conceptGraphStats != null && (
                <p className="small text-body-secondary mt-2 mb-0">
                  Knowledge graph:{' '}
                  <strong>
                    {conceptGraphStats.nodes} concept{conceptGraphStats.nodes === 1 ? '' : 's'}
                  </strong>
                  ,{' '}
                  <strong>
                    {conceptGraphStats.edges} edge{conceptGraphStats.edges === 1 ? '' : 's'}
                  </strong>
                  . Concepts are graph nodes; flashcards link to concepts.
                </p>
              )}
              </div>
            </div>
          </div>
        </div>
        <div className="col-lg-9 col-md-8">
          {!currentItem ? (
            <>
              {mainSection === 'library' && (
                <div className="card shadow-sm mb-3">
                  <div className="card-body py-2 d-flex flex-wrap align-items-center gap-3">
                    <label htmlFor="library-notion-filter" className="small mb-0 fw-semibold text-body-secondary">
                      Show notion level
                    </label>
                    <select
                      id="library-notion-filter"
                      className="form-select form-select-sm w-auto min-w-0"
                      title="Filters Draft and Approved library lists."
                      value={libraryNotionFilter}
                      onChange={(e) => setLibraryNotionFilter(e.target.value)}
                    >
                      <option value="all">All levels</option>
                      <option value="elementary">Elementary only</option>
                      <option value="intermediate">Intermediate only</option>
                      <option value="expert">Expert only</option>
                    </select>
                    <span className="small text-muted">
                      Narrow lists to practise easier cards first — search results are unaffected.
                    </span>
                  </div>
                </div>
              )}
              {mainSection === 'ask' && (
                <div className="card shadow-sm">
                  <div className="card-body">{renderAskPanel('main')}</div>
                </div>
              )}
              {mainSection === 'generate' && (
                <div className="card shadow-sm">
                  <div className="card-header">Generate draft flashcards</div>
                  <div className="card-body">
                    <label className="form-label small">Topic</label>
                    <input
                      className="form-control form-control-sm mb-2"
                      value={genTopic}
                      onChange={(e) => setGenTopic(e.target.value)}
                      placeholder="e.g. CI/CD secrets with GitHub Actions"
                    />
                    <label className="form-label small">Audience / depth (optional)</label>
                    <input
                      className="form-control form-control-sm mb-2"
                      value={genAudience}
                      onChange={(e) => setGenAudience(e.target.value)}
                      placeholder="e.g. senior data engineer interview"
                    />
                    <div className="mb-3" role="group" aria-labelledby="gen-notion-legend">
                      <div id="gen-notion-legend" className="form-label small mb-2">
                        Notion level for this batch
                      </div>
                      <div className="d-flex flex-wrap gap-3">
                        {NOTION_LEVELS.map((lvl) => {
                          const nid = `gen-notion-${lvl}`
                          const cap = notionLevelBadgeVisual(lvl).label
                          return (
                            <div key={lvl} className="form-check mb-0">
                              <input
                                className="form-check-input"
                                type="radio"
                                name="gen-notion-level"
                                id={nid}
                                checked={genNotionLevel === lvl}
                                disabled={genLoading}
                                onChange={() => setGenNotionLevel(lvl)}
                              />
                              <label className="form-check-label small" htmlFor={nid} title={notionLevelHelpTitle(lvl)}>
                                {cap}
                              </label>
                            </div>
                          )
                        })}
                      </div>
                      <p className="small text-muted mb-0 mt-2">
                        The model will tailor every draft to this difficulty; notion tags on cards match your choice.
                      </p>
                    </div>
                    <label className="form-label small">Count</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      className="form-control form-control-sm mb-2"
                      value={genCount}
                      onChange={(e) => setGenCount(e.target.value)}
                    />
                    <p className="small text-muted mb-2">
                      Each draft then gets the same AI extract as &quot;Extract concepts&quot; (attached concepts, optional
                      graph links, broad tags) — one extra model call per card.
                    </p>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={genLoading}
                      onClick={runGenerate}
                    >
                      {genLoading ? 'Generating…' : 'Generate'}
                    </button>
                    {genError && <p className="text-danger small mt-2 mb-0">{genError}</p>}
                    {genMessage && <p className="text-success small mt-2 mb-0">{genMessage}</p>}
                  </div>
                </div>
              )}
              {mainSection === 'library' && libraryTab === 'draft' && (
                <div className="card shadow-sm">
                  <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
                    <span>Drafts</span>
                    {lastGeneratedIds.length > 0 ? (
                      <span className="small text-muted mb-0">
                        Latest generate batch listed first (see <span className="badge bg-info text-dark">This batch</span>)
                      </span>
                    ) : null}
                  </div>
                  <ul className="list-group list-group-flush">
                    {draftsLoading ? (
                      <li className="list-group-item text-muted small">Loading drafts…</li>
                    ) : !mainDraftRows.length ? (
                      <li className="list-group-item text-muted small">No drafts</li>
                    ) : (
                      mainDraftRows.map((d) => renderLibraryRow(d, { isDraftList: true }))
                    )}
                  </ul>
                </div>
              )}
              {mainSection === 'library' && libraryTab === 'approved' && (
                <>
                  <form onSubmit={runSearch} className="card shadow-sm mb-3">
                    <div className="card-body">
                      <label className="form-label">Search saved cards (approved only)</label>
                      <p className="small text-muted mb-2">
                        Matches words in the question, answer fields, tags, linked concepts, and the{' '}
                        <strong>topic / session label</strong>. Drafts are under <strong>Library → Draft</strong>.
                      </p>
                      <div className="input-group">
                        <input
                          className="form-control"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="e.g. CI/CD secrets"
                        />
                        <button type="submit" className="btn btn-primary" disabled={searchLoading}>
                          {searchLoading ? 'Searching…' : 'Search'}
                        </button>
                      </div>
                      {searchError && <p className="text-danger small mt-2 mb-0">{searchError}</p>}
                    </div>
                  </form>

                  <div className="card shadow-sm">
                    <div className="card-header d-flex justify-content-between align-items-center">
                      <span>Results</span>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={refreshLibrarySidebar}
                        disabled={draftsLoading || approvedLoading}
                      >
                        Refresh lists
                      </button>
                    </div>
                    <ul className="list-group list-group-flush">
                      {(matches || []).length === 0 ? (
                        <li className="list-group-item text-muted">No results yet — try a search.</li>
                      ) : (
                        matches.map((m) => {
                          const sb = notionLevelBadgeVisual(m.notion_level)
                          return (
                          <li key={m.id} className="list-group-item">
                            <div className="d-flex flex-wrap align-items-start gap-2">
                              <button
                                type="button"
                                className="btn btn-link p-0 text-start text-decoration-none flex-grow-1"
                                onClick={() => openItem(m.id)}
                              >
                                {m.title}
                              </button>
                              <span
                                className={`badge rounded-pill ${sb.className} flex-shrink-0 mt-1`}
                                title={notionLevelHelpTitle(m.notion_level)}
                              >
                                {sb.label}
                              </span>
                            </div>
                            {m.tags?.length > 0 && (
                              <div className="small text-muted mt-1">
                                {(m.tags || []).map((t) => t.name).join(' · ')}
                              </div>
                            )}
                          </li>
                          )
                        })
                      )}
                    </ul>
                  </div>

                  <div className="card shadow-sm mt-3">
                    <div className="card-header">All approved ({approvedItems.length})</div>
                    <ul className="list-group list-group-flush">
                      {approvedLoading ? (
                        <li className="list-group-item text-muted small">Loading approved…</li>
                      ) : !sortedApproved.length ? (
                        <li className="list-group-item text-muted small">No approved cards yet</li>
                      ) : (
                        sortedApproved.map((d) => renderLibraryRow(d, { isDraftList: false }))
                      )}
                    </ul>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="card shadow-sm">
              <div className="card-body">
                {detailLoading && <p className="text-muted">Loading…</p>}
                {detailError && <p className="text-danger">{detailError}</p>}

                {currentItem && !detailLoading && (
                  <>
                    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                      <nav aria-label="breadcrumb" className="mb-0 min-w-0">
                        <ol className="breadcrumb small mb-0 flex-wrap">
                          <li className="breadcrumb-item">
                            <button
                              type="button"
                              className="btn btn-link btn-sm p-0"
                              onClick={() =>
                                leaveCardForLibraryTab(currentItem?.status === 'draft' ? 'draft' : 'approved')
                              }
                            >
                              Library
                            </button>
                          </li>
                          <li className="breadcrumb-item active fw-medium" aria-current="page">
                            {currentItem.status === 'draft' ? 'Draft' : 'Approved'}
                          </li>
                        </ol>
                      </nav>
                      {currentItem.status === 'approved' && currentItem.type === 'flashcard' && (
                        <div className="d-flex flex-wrap align-items-center gap-2 flex-shrink-0 justify-content-end">
                          <span className="small text-muted text-nowrap d-none d-md-inline">Review (logged for later SRS)</span>
                          <div className="btn-group btn-group-sm flex-wrap">
                            {['again', 'hard', 'good', 'easy'].map((e) => (
                              <button
                                key={e}
                                type="button"
                                className="btn btn-outline-secondary"
                                onClick={() => recordReview(e)}
                              >
                                {e}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="row g-2 mb-2 learning-card-peer-nav">
                      <div className="col-6 min-w-0">
                        {cardNavPeers.prev ? (
                          <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm w-100 text-start learning-card-peer-btn align-items-start"
                            title={cardNavPeers.prev.title}
                            onClick={() => openItem(cardNavPeers.prev.id)}
                          >
                            <span className="learning-peer-nav-label text-wrap">Previous</span>
                            <span className="learning-peer-nav-title small text-break">{cardNavPeers.prev.title}</span>
                          </button>
                        ) : (
                          <div className="learning-card-peer-empty border rounded px-2 py-1 bg-body-secondary bg-opacity-25 text-start">
                            <span className="visually-hidden">No previous card in this queue</span>
                            <span className="learning-peer-nav-label text-wrap text-muted" aria-hidden="true">
                              Previous
                            </span>
                            <span className="learning-peer-nav-title small fst-italic text-muted" aria-hidden="true">
                              None
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="col-6 min-w-0">
                        {cardNavPeers.next ? (
                          <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm w-100 text-end learning-card-peer-btn align-items-end"
                            title={cardNavPeers.next.title}
                            onClick={() => openItem(cardNavPeers.next.id)}
                          >
                            <span className="learning-peer-nav-label text-wrap">Next</span>
                            <span className="learning-peer-nav-title small text-break">{cardNavPeers.next.title}</span>
                          </button>
                        ) : (
                          <div className="learning-card-peer-empty border rounded px-2 py-1 bg-body-secondary bg-opacity-25 text-end">
                            <span className="visually-hidden">No next card in this queue</span>
                            <span className="learning-peer-nav-label text-wrap text-muted" aria-hidden="true">
                              Next
                            </span>
                            <span className="learning-peer-nav-title small fst-italic text-muted" aria-hidden="true">
                              None
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 py-1 border-bottom mb-2">
                      <div className="d-flex flex-wrap align-items-center gap-1">
                        {currentItem.status === 'draft' && (
                          <span className="badge bg-warning text-dark">Draft</span>
                        )}
                        {currentItem.source === 'ai_generated' && (
                          <span className="badge bg-info text-dark">AI</span>
                        )}
                        {currentItem.source === 'imported' && (
                          <span className="badge bg-secondary">Imported</span>
                        )}
                        <span className="badge bg-secondary">{itemTypeLabel(currentItem.type)}</span>
                        {(currentItem.source_topic || '').trim() && (
                          <span
                            className="badge rounded-pill bg-secondary-subtle text-dark border"
                            title="Topic / session — edit in Edit card"
                          >
                            {(currentItem.source_topic || '').trim()}
                          </span>
                        )}
                        {currentItem.status === 'draft' && (
                          <span className="small text-muted ms-1">
                            <strong className="text-body-secondary">Origin:</strong> {draftOriginLabel(currentItem.source)}
                          </span>
                        )}
                      </div>
                      <div className="d-flex flex-wrap gap-1 align-items-center justify-content-end">
                        {!cardEditing ? (
                          <button
                            type="button"
                            className="btn btn-outline-primary btn-sm"
                            onClick={() => {
                              setCardEditing(true)
                              fillEditFromItem(currentItem)
                              setShowAnswer(true)
                              setActionMessage(null)
                            }}
                          >
                            Edit card
                          </button>
                        ) : (
                          <div className="d-flex flex-wrap align-items-center gap-2">
                            <div className="form-check form-check-inline small mb-0">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                id="learning-save-graph-edges"
                                checked={saveWithGraphEdges}
                                onChange={(e) => setSaveWithGraphEdges(e.target.checked)}
                                disabled={saveCardPending}
                              />
                              <label
                                className="form-check-label text-muted"
                                htmlFor="learning-save-graph-edges"
                                title="After save, run AI to suggest concept→concept links (uses your OpenAI key)."
                              >
                                Suggest graph links on save (AI)
                              </label>
                            </div>
                            <button
                              type="button"
                              className="btn btn-success btn-sm"
                              onClick={saveCardEdits}
                              disabled={saveCardPending}
                            >
                              {saveCardPending ? 'Saving…' : 'Save card'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline-secondary btn-sm"
                              onClick={() => {
                                setCardEditing(false)
                                fillEditFromItem(currentItem)
                                setActionMessage(null)
                              }}
                              disabled={saveCardPending}
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                        <button type="button" className="btn btn-outline-danger btn-sm" onClick={deleteCurrentCard}>
                          Delete card
                        </button>
                        {currentItem.status === 'draft' && (
                          <button type="button" className="btn btn-success btn-sm" onClick={approveCurrent}>
                            Approve card
                          </button>
                        )}
                      </div>
                    </div>

                    {!cardEditing ? (
                      <>
                        {currentItem.type === 'flashcard' ? (
                          <div className="learning-flashcard card border-0 shadow-sm mb-3">
                            <div className="card-body p-3">
                              <h2 className="h5 text-center mb-2 px-md-5">{currentItem.title}</h2>
                              {(() => {
                                const v = notionLevelBadgeVisual(currentItem.notion_level)
                                const aud = (currentItem.content?.audience ?? '').trim()
                                return (
                                  <p
                                    className="text-center small text-secondary mb-3 px-md-5"
                                    title={notionLevelHelpTitle(currentItem.notion_level)}
                                  >
                                    <span className={`badge rounded-pill ${v.className} align-middle me-1`}>
                                      {v.label} notion
                                    </span>
                                    {aud ? (
                                      <>
                                        <span className="text-muted" aria-hidden>
                                          {' '}
                                          |{' '}
                                        </span>
                                        <span className="text-muted">Audience:</span>{' '}
                                        <span className="text-body-secondary">{aud}</span>
                                      </>
                                    ) : null}
                                  </p>
                                )
                              })()}
                              {(currentItem.content?.learning_goal || currentItem.content?.common_mistake) && (
                                <div className="row g-3 mb-4">
                                  <div className="col-md-6">
                                    {currentItem.content?.learning_goal ? (
                                      <div className="learning-flashcard-goal rounded-3 p-3 small h-100">
                                        <div className="fw-semibold text-success-emphasis mb-1">Goal</div>
                                        <div>{currentItem.content.learning_goal}</div>
                                      </div>
                                    ) : (
                                      <div className="h-100" aria-hidden />
                                    )}
                                  </div>
                                  <div className="col-md-6">
                                    {currentItem.content?.common_mistake ? (
                                      <div className="learning-flashcard-mistake rounded-3 p-3 small h-100">
                                        <div className="fw-semibold text-danger-emphasis mb-1">Common mistake</div>
                                        <div>{currentItem.content.common_mistake}</div>
                                      </div>
                                    ) : (
                                      <div className="h-100" aria-hidden />
                                    )}
                                  </div>
                                </div>
                              )}
                              {!showAnswer ? (
                                <div className="text-center pt-2">
                                  <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={() => {
                                      setShowAnswer(true)
                                      setStudyHintsVisible(true)
                                    }}
                                  >
                                    Reveal answer
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div className="learning-flashcard-answer border-top pt-4 mt-2 mx-auto" style={{ maxWidth: '42rem' }}>
                                    <p className="mb-0 text-start" style={{ whiteSpace: 'pre-wrap', fontSize: '1.05rem' }}>
                                      {currentItem.content?.answer || '—'}
                                    </p>
                                  </div>
                                  <div className="mt-3 pt-3 border-top mx-auto" style={{ maxWidth: '42rem' }}>
                                    <div className="d-flex flex-wrap align-items-center gap-2 justify-content-center text-md-start">
                                      <button
                                        type="button"
                                        className="btn btn-outline-secondary btn-sm"
                                        title="Run AI to attach concepts and edges, and merge suggested broad_tags when the model returns them."
                                        disabled={extractLoading}
                                        onClick={runExtractConcepts}
                                      >
                                        {extractLoading ? 'Thinking…' : 'Extract concepts (AI)'}
                                      </button>
                                      <span className="small text-muted">
                                        Broad_tags from the model are merged into your tags; edit tags anytime.
                                      </span>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        ) : (
                          <>
                            <h2 className="h5 mb-2">{currentItem.title}</h2>
                            {(() => {
                              const v = notionLevelBadgeVisual(currentItem.notion_level)
                              return (
                                <p className="small text-secondary mb-3">
                                  <span className={`badge rounded-pill ${v.className} align-middle me-1`}>{v.label} notion</span>
                                </p>
                              )
                            })()}
                            <pre className="border rounded p-3 bg-light small overflow-auto">
                              {currentItem.content?.body_markdown || '—'}
                            </pre>
                            <div className="mb-3 pt-2 border-top">
                              <div className="d-flex flex-wrap align-items-center gap-2">
                                <button
                                  type="button"
                                  className="btn btn-outline-secondary btn-sm"
                                  title="Run AI to attach concepts and edges, and merge suggested broad_tags when the model returns them."
                                  disabled={extractLoading}
                                  onClick={runExtractConcepts}
                                >
                                  {extractLoading ? 'Thinking…' : 'Extract concepts (AI)'}
                                </button>
                                <span className="small text-muted">
                                  Broad_tags from the model are merged into your tags; edit anytime.
                                </span>
                              </div>
                            </div>
                          </>
                        )}
                      </>
                    ) : (
                      <div className="mb-3">
                        <label className="form-label small fw-bold">Title</label>
                        <input
                          className="form-control form-control-sm mb-2"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                        />
                        <div className="mb-3">
                          <label className="form-label small mb-1 fw-bold">
                            Topic / session label (shown as a badge; helps group cards in the library)
                          </label>
                          <div className="input-group input-group-sm">
                            <input
                              className="form-control"
                              value={topicLabelInput}
                              onChange={(e) => setTopicLabelInput(e.target.value)}
                              placeholder="e.g. CI/CD secrets, then Kubernetes networking"
                            />
                            <button type="button" className="btn btn-outline-secondary" onClick={saveTopicLabel}>
                              Save label
                            </button>
                          </div>
                        </div>
                        <div className="mb-3">
                          <label htmlFor="edit-notion-level" className="form-label small fw-bold mb-1">
                            Notion difficulty
                          </label>
                          <select
                            id="edit-notion-level"
                            className="form-select form-select-sm mb-1"
                            value={editNotionLevel}
                            onChange={(e) => setEditNotionLevel(coerceNotionLevel(e.target.value))}
                          >
                            {NOTION_LEVELS.map((lvl) => (
                              <option key={lvl} value={lvl}>
                                {notionLevelBadgeVisual(lvl).label} ({NOTION_OPTION_HINT[lvl]})
                              </option>
                            ))}
                          </select>
                          <p className="small text-muted mb-0">
                            Labels how demanding the core idea on this card is{' '}
                            <span className="text-nowrap">(elementary → expert)</span> so you can filter the library while you
                            practise.
                          </p>
                        </div>
                        {currentItem.type === 'flashcard' ? (
                          <>
                            <label className="form-label small fw-bold">Answer</label>
                            <textarea
                              className="form-control form-control-sm mb-2"
                              rows={6}
                              value={editAnswer}
                              onChange={(e) => setEditAnswer(e.target.value)}
                              style={{ whiteSpace: 'pre-wrap' }}
                            />
                            <label className="form-label small fw-bold">Audience / depth (optional)</label>
                            <input
                              className="form-control form-control-sm mb-2"
                              value={editAudience}
                              onChange={(e) => setEditAudience(e.target.value)}
                              placeholder="Shown under the question — e.g. same as Generate form or who this targets"
                              maxLength={2048}
                            />
                            <div className="row g-2">
                              <div className="col-md-6">
                                <label className="form-label small fw-bold">Learning goal</label>
                                <input
                                  className="form-control form-control-sm"
                                  value={editLearningGoal}
                                  onChange={(e) => setEditLearningGoal(e.target.value)}
                                />
                              </div>
                              <div className="col-md-6">
                                <label className="form-label small fw-bold">Expected depth</label>
                                <input
                                  className="form-control form-control-sm"
                                  value={editExpectedDepth}
                                  onChange={(e) => setEditExpectedDepth(e.target.value)}
                                />
                              </div>
                              <div className="col-md-6">
                                <label className="form-label small fw-bold">Common mistake</label>
                                <input
                                  className="form-control form-control-sm"
                                  value={editCommonMistake}
                                  onChange={(e) => setEditCommonMistake(e.target.value)}
                                />
                              </div>
                              <div className="col-md-6">
                                <label className="form-label small fw-bold">Example</label>
                                <input
                                  className="form-control form-control-sm"
                                  value={editExample}
                                  onChange={(e) => setEditExample(e.target.value)}
                                />
                              </div>
                              <div className="col-12">
                                <label className="form-label small fw-bold">Related to</label>
                                <input
                                  className="form-control form-control-sm"
                                  value={editRelatedTo}
                                  onChange={(e) => setEditRelatedTo(e.target.value)}
                                />
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <label className="form-label small fw-bold">Body (Markdown)</label>
                            <textarea
                              className="form-control form-control-sm font-monospace"
                              rows={12}
                              value={editNoteBody}
                              onChange={(e) => setEditNoteBody(e.target.value)}
                            />
                          </>
                        )}
                        <div className="mt-3 pt-3 border-top">
                          <label className="form-label small fw-bold">Tags</label>
                          <p className="small text-muted mb-1">
                            Broad labels for search — add manually; extract may append broad_tags suggested by the model.
                          </p>
                          <div className="input-group input-group-sm align-items-start">
                            <textarea
                              className="form-control"
                              rows={tagRows}
                              value={tagInput}
                              onChange={(e) => setTagInput(e.target.value)}
                              style={{ minHeight: '4.5rem', resize: 'vertical' }}
                            />
                            <button type="button" className="btn btn-outline-primary btn-sm" onClick={saveTags}>
                              Save tags
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline-secondary btn-sm"
                              title="Run AI to attach concepts and edges, and merge suggested broad_tags when the model returns them."
                              disabled={extractLoading}
                              onClick={runExtractConcepts}
                            >
                              {extractLoading ? 'Thinking…' : 'Extract concepts (AI)'}
                            </button>
                          </div>
                        </div>
                        {extractConceptsFeedback && cardEditing && (
                          <p
                            className={`small mt-2 mb-0 ${extractConceptsFeedback.ok ? 'text-success' : 'text-danger'}`}
                          >
                            {extractConceptsFeedback.text}
                          </p>
                        )}
                      </div>
                    )}

                    {!cardEditing && hasStudyHintsSection && (
                      <div className="mb-4">
                        <div className="form-check form-switch mb-2">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            role="switch"
                            checked={studyHintsVisible}
                            onChange={(e) => setStudyHintsVisible(e.target.checked)}
                            id="learning-study-hints-toggle"
                          />
                          <label className="form-check-label small" htmlFor="learning-study-hints-toggle">
                            Show concepts and tags (study hints). Turn off to blur them while you practise from memory.
                          </label>
                        </div>
                        <div
                          className={`row g-3 ${!studyHintsVisible ? 'learning-study-hints-blurred' : ''}`}
                        >
                          <div className="col-md-6">
                            {Array.isArray(currentItem.concepts) && currentItem.concepts.length > 0 ? (
                              <>
                                <div className="small fw-semibold mb-2">Concepts</div>
                                <ul className="list-unstyled small mb-0 border rounded p-3 bg-light">
                                  {currentItem.concepts.map((c, idx) => (
                                    <li key={`${c.name}-${idx}`} className="mb-2">
                                      <span className="fw-medium">{c.name}</span>
                                      {c.type ? (
                                        <span className="text-muted ms-1">
                                          ·{' '}
                                          <abbr
                                            className="text-decoration-dotted"
                                            title={conceptTypeTitle(c.type)}
                                          >
                                            {humanizeSnake(c.type)}
                                          </abbr>
                                        </span>
                                      ) : null}
                                      {c.importance ? (
                                        <span className="text-muted ms-1">
                                          ·{' '}
                                          <abbr
                                            className="text-decoration-dotted"
                                            title={conceptImportanceTitle(c.importance)}
                                          >
                                            {humanizeSnake(c.importance)}
                                          </abbr>
                                        </span>
                                      ) : null}
                                      {c.id ? (
                                        <span className="ms-1">
                                          <button
                                            type="button"
                                            className="btn btn-link btn-sm p-0 align-baseline"
                                            onClick={() => openConceptExplore(c.id)}
                                          >
                                            Explore
                                          </button>
                                        </span>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              </>
                            ) : (
                              <div className="text-muted small border rounded p-3 bg-light">No extracted concepts.</div>
                            )}
                            {extractConceptsFeedback && (
                              <p
                                className={`small mt-2 mb-0 ${extractConceptsFeedback.ok ? 'text-success' : 'text-danger'}`}
                              >
                                {extractConceptsFeedback.text}
                              </p>
                            )}
                          </div>
                          <div className="col-md-6">
                            <div className="small fw-semibold mb-2">Tags</div>
                            <div className="border rounded p-3 bg-light">
                              {parseTagNames(tagInput).length > 0 ? (
                                <div className="d-flex flex-wrap gap-1">
                                  {parseTagNames(tagInput).map((name) => (
                                    <span key={name} className="badge rounded-pill bg-secondary-subtle text-dark border">
                                      {name}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-muted small">No tags yet.</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {currentItem && exploreConceptId != null && (
                      <div className="card border-primary shadow-sm mb-4">
                        <div className="card-header py-2 d-flex flex-wrap align-items-center justify-content-between gap-2 bg-primary-subtle">
                          <span className="small fw-semibold mb-0">
                            Explore
                            {exploreDetailMatchesConcept && explorePayload?.concept?.name ? (
                              <>
                                :{' '}
                                <span className="text-primary-emphasis">{explorePayload.concept.name}</span>
                              </>
                            ) : exploreLoading ? (
                              <span className="text-muted ms-1">Loading…</span>
                            ) : null}
                          </span>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={closeConceptExplore}
                          >
                            Close
                          </button>
                        </div>
                        <div className="card-body py-3">
                          {exploreError && (
                            <p className="small text-danger mb-2 mb-md-0">{exploreError}</p>
                          )}
                          {exploreLoading && !exploreDetailMatchesConcept && (
                            <p className="small text-muted mb-2 mb-md-3">
                              <span className="spinner-border spinner-border-sm me-2" aria-hidden />
                              Loading graph neighbourhood…
                            </p>
                          )}
                          {exploreLoading && exploreDetailMatchesConcept && (
                            <div className="small text-muted d-flex align-items-center gap-2 mb-2 mb-md-3">
                              <span className="spinner-border spinner-border-sm" aria-hidden />
                              Updating neighbourhood…
                            </div>
                          )}
                          {exploreDetailMatchesConcept && !exploreError && explorePayload && (
                            <div
                              style={{
                                opacity: exploreLoading ? 0.92 : 1,
                                transition: 'opacity 120ms ease-out',
                              }}
                            >
                              <p className="small text-muted mb-3 mb-md-2">
                                Follow links to neighbouring concepts, or open a card that mentions this idea.
                              </p>
                              <div className="row g-3">
                                <div className="col-md-6">
                                  <div className="small fw-semibold mb-2">Incoming</div>
                                  {explorePayload.incoming_edges?.length ? (
                                    <ul className="list-unstyled small mb-0 border rounded p-3 bg-light">
                                      {explorePayload.incoming_edges.map((e) => (
                                        <li key={e.edge_id} className="mb-2">
                                          <button
                                            type="button"
                                            className="btn btn-link btn-sm p-0 align-baseline"
                                            onClick={() => openConceptExplore(e.source_concept_id)}
                                          >
                                            {e.source_name}
                                          </button>
                                          <span className="text-muted">
                                            {' '}
                                            —{humanizeSnake(e.relation_type)}→{' '}
                                            <span className="text-body">{explorePayload.concept.name}</span>
                                          </span>
                                          {e.reason ? (
                                            <span className="text-muted d-block small mt-1">{e.reason}</span>
                                          ) : null}
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <div className="text-muted small border rounded p-3 bg-light">No incoming links.</div>
                                  )}
                                </div>
                                <div className="col-md-6">
                                  <div className="small fw-semibold mb-2">Outgoing</div>
                                  {explorePayload.outgoing_edges?.length ? (
                                    <ul className="list-unstyled small mb-0 border rounded p-3 bg-light">
                                      {explorePayload.outgoing_edges.map((e) => (
                                        <li key={e.edge_id} className="mb-2">
                                          <span className="text-body">{explorePayload.concept.name}</span>
                                          <span className="text-muted">
                                            {' '}
                                            —{humanizeSnake(e.relation_type)}→{' '}
                                          </span>
                                          <button
                                            type="button"
                                            className="btn btn-link btn-sm p-0 align-baseline"
                                            onClick={() => openConceptExplore(e.target_concept_id)}
                                          >
                                            {e.target_name}
                                          </button>
                                          {e.reason ? (
                                            <span className="text-muted d-block small mt-1">{e.reason}</span>
                                          ) : null}
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <div className="text-muted small border rounded p-3 bg-light">No outgoing links.</div>
                                  )}
                                </div>
                              </div>
                              <div className="mt-3 pt-2 border-top">
                                <div className="small fw-semibold mb-2">Cards in your library</div>
                                {explorePayload.linked_items?.length ? (
                                  <ul className="list-unstyled small mb-0">
                                    {explorePayload.linked_items.map((it) => {
                                      const ex = notionLevelBadgeVisual(it.notion_level)
                                      return (
                                      <li key={it.id} className="mb-1">
                                        <button
                                          type="button"
                                          className="btn btn-link btn-sm p-0 text-start"
                                          onClick={() => openLinkedItemFromExplore(it.id)}
                                        >
                                          {it.title}
                                        </button>
                                        <span className="text-muted">
                                          {' '}
                                          ·{' '}
                                          <span className={`badge rounded-pill ${ex.className} align-middle`}>
                                            {ex.label}
                                          </span>
                                          {' '}
                                          · {it.status} · {it.type}
                                        </span>
                                      </li>
                                      )
                                    })}
                                  </ul>
                                ) : (
                                  <p className="small text-muted mb-0">
                                    No cards attach this concept yet — extract concepts on a card or link it when editing
                                    (API).
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {currentItem && cardEditing && (
                      <div className="border rounded p-3 mb-4 bg-body-secondary bg-opacity-10">
                        <div className="small fw-semibold mb-2">Add graph edge (manual)</div>
                        <p className="small text-muted mb-3 mb-md-2">
                          Link two concepts in your library. This calls the same API as AI-suggested edges
                          (<span className="font-monospace">POST /api/learning/concept-relationships</span>).
                        </p>
                        {!learningGraphDetail ? (
                          <p className="small text-muted mb-0">Loading concept list…</p>
                        ) : learningGraphDetail.nodes.length < 2 ? (
                          <p className="small text-muted mb-0">
                            You need at least two concepts (for example, run Extract concepts on your cards first).
                          </p>
                        ) : (
                          <div className="row g-2 align-items-end">
                            <div className="col-md-6 col-lg-3">
                              <label className="form-label small mb-0 fw-bold">From (source)</label>
                              <select
                                className="form-select form-select-sm"
                                value={manualEdgeSourceId}
                                onChange={(e) => setManualEdgeSourceId(e.target.value)}
                                disabled={manualEdgeLoading}
                              >
                                <option value="">—</option>
                                {[...learningGraphDetail.nodes]
                                  .sort((a, b) => (a.title || '').localeCompare(b.title || ''))
                                  .map((n) => (
                                    <option key={n.id} value={String(n.id)}>
                                      {n.title} (#{n.id})
                                    </option>
                                  ))}
                              </select>
                            </div>
                            <div className="col-md-6 col-lg-3">
                              <label className="form-label small mb-0 fw-bold">To (target)</label>
                              <select
                                className="form-select form-select-sm"
                                value={manualEdgeTargetId}
                                onChange={(e) => setManualEdgeTargetId(e.target.value)}
                                disabled={manualEdgeLoading}
                              >
                                <option value="">—</option>
                                {[...learningGraphDetail.nodes]
                                  .sort((a, b) => (a.title || '').localeCompare(b.title || ''))
                                  .map((n) => (
                                    <option key={`t-${n.id}`} value={String(n.id)}>
                                      {n.title} (#{n.id})
                                    </option>
                                  ))}
                              </select>
                            </div>
                            <div className="col-md-6 col-lg-3">
                              <label className="form-label small mb-0 fw-bold">Relationship</label>
                              <select
                                className="form-select form-select-sm"
                                value={manualEdgeRelationship}
                                onChange={(e) => setManualEdgeRelationship(e.target.value)}
                                disabled={manualEdgeLoading}
                              >
                                {LINK_RELATIONSHIP_TYPES.map((t) => (
                                  <option key={t} value={t}>
                                    {humanizeSnake(t)}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="col-12 col-lg-9">
                              <label className="form-label small mb-0 fw-bold">Reason (optional)</label>
                              <input
                                type="text"
                                className="form-control form-control-sm"
                                value={manualEdgeReason}
                                onChange={(e) => setManualEdgeReason(e.target.value)}
                                placeholder="Why these concepts are linked"
                                disabled={manualEdgeLoading}
                              />
                            </div>
                            <div className="col-12 col-lg-3">
                              <button
                                type="button"
                                className="btn btn-outline-primary btn-sm w-100"
                                disabled={
                                  manualEdgeLoading ||
                                  !manualEdgeSourceId ||
                                  !manualEdgeTargetId ||
                                  manualEdgeSourceId === manualEdgeTargetId
                                }
                                onClick={createManualConceptEdge}
                              >
                                {manualEdgeLoading ? 'Saving…' : 'Create edge'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="learning-ai-follow-up-divider d-flex align-items-center gap-3 mt-4 mb-1">
                      <hr className="flex-grow-1 opacity-50 m-0" />
                      <span
                        className="small text-muted flex-shrink-0 text-uppercase fw-semibold"
                        style={{ letterSpacing: '0.08em', fontSize: '0.7rem' }}
                      >
                        Follow up with AI
                      </span>
                      <hr className="flex-grow-1 opacity-50 m-0" />
                    </div>

                    <div className="row g-3 mt-0">
                      <div className="col-md-6">
                        <div className="border rounded-3 p-3 h-100 bg-body-tertiary learning-ai-follow-up-panel">
                          {renderAskPanel('card')}
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="border rounded-3 p-3 h-100 bg-body-tertiary learning-ai-follow-up-panel">
                          <p className="small text-muted mb-2 learning-ai-follow-up-intro">
                            Rewrite this card for more depth.
                            <br />
                            Preview the suggestion first, then save as returned or open it in the editor to edit the card
                            yourself.
                          </p>
                          <textarea
                            className="form-control mb-2"
                            rows={3}
                            value={refreshAudience}
                            onChange={(e) => setRefreshAudience(e.target.value)}
                            placeholder="Audience / depth (optional), e.g. senior SRE interview"
                            disabled={refreshLoading}
                          />
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={refreshLoading}
                            onClick={runAiRefreshPreview}
                          >
                            {refreshLoading ? 'Thinking…' : 'Refresh with AI'}
                          </button>
                          {aiProposal && (
                            <div className="d-flex flex-wrap gap-2 align-items-center pt-2 mt-2 border-top">
                              <span className="small fw-medium text-success">Suggestion ready.</span>
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                onClick={saveAiProposalAsReturned}
                              >
                                Save as returned
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-primary"
                                onClick={putAiProposalInEditor}
                              >
                                Edit before save
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-link px-1"
                                onClick={() => {
                                  setAiProposal(null)
                                  setActionMessage(null)
                                }}
                              >
                                Discard
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {actionMessage && <p className="small text-success mt-3 mb-0">{actionMessage}</p>}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
