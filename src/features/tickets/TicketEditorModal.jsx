import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  TICKET_AUDIENCE_TYPES,
  TICKET_TYPES,
  deriveTicketUsageDate,
  normalizeTicket,
  normalizeTicketHttpUrl,
} from './ticketModel.js';

const MAX_TICKET_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);
const FILE_KIND_BY_EXTENSION = Object.freeze({
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  webp: 'image',
  gif: 'image',
  pdf: 'pdf',
});
const REMINDER_OPTIONS = [
  { value: 0, label: '不提醒' },
  { value: 5, label: '5 分鐘' },
  { value: 15, label: '15 分鐘' },
  { value: 30, label: '30 分鐘' },
  { value: 60, label: '1 小時' },
];

const trimText = (value) => String(value ?? '').trim();

const normalizeList = (values) => {
  const normalized = [];
  const source = Array.isArray(values) ? values : [];
  source.forEach((value) => {
    const item = trimText(value);
    if (item && !normalized.includes(item)) normalized.push(item);
  });
  return normalized;
};

const getFileExtension = (file) => {
  const name = trimText(file?.name).toLowerCase();
  const separator = name.lastIndexOf('.');
  return separator >= 0 ? name.slice(separator + 1) : '';
};

const getAttachmentKindFromFile = (file) => {
  const type = trimText(file?.type).toLowerCase();
  if (type === 'application/pdf') return 'pdf';
  if (type.startsWith('image/') && ALLOWED_FILE_TYPES.has(type)) return 'image';
  return FILE_KIND_BY_EXTENSION[getFileExtension(file)] || '';
};

const validateTicketFile = (file) => {
  if (!file) return '請選擇圖片或 PDF 票券。';

  const type = trimText(file.type).toLowerCase();
  const extensionKind = FILE_KIND_BY_EXTENSION[getFileExtension(file)] || '';
  if ((type && !ALLOWED_FILE_TYPES.has(type)) || (!type && !extensionKind)) {
    return '僅接受 JPEG、PNG、WebP、GIF 圖片或 PDF。';
  }
  if (file.size > MAX_TICKET_FILE_BYTES) {
    return '檔案大小不可超過 10 MB。';
  }
  return '';
};

const isExistingAttachmentValid = (ticket) => (
  ticket.ticketType === TICKET_TYPES.ATTACHMENT
  && ['image', 'pdf'].includes(ticket.attachmentKind)
  && Boolean(ticket.url || ticket.storagePath)
);

const safeMemberTestId = (member) => Array.from(trimText(member))
  .map((character) => (/^[a-z\d_-]$/i.test(character)
    ? character.toLowerCase()
    : `u${character.codePointAt(0).toString(16)}`))
  .join('-');

const formatDayLabel = (dayId, startDate, index) => {
  const dayMatch = /^Day\s+(\d+)$/.exec(dayId);
  const dayNumber = dayMatch ? Number(dayMatch[1]) : index + 1;
  const usageDate = deriveTicketUsageDate({ dayId, startDate });
  const displayDate = usageDate ? usageDate.replaceAll('-', '/') : '日期未設定';
  return `第 ${dayNumber} 天・${displayDate}`;
};

const FieldError = ({ id, message }) => (
  message ? <p id={id} className="mt-1 text-xs font-bold text-red-600">{message}</p> : null
);

const getInitialForm = ({ mode, ticket, members, existingDays, defaultDayId, activeMember }) => {
  const isEdit = mode === 'edit';
  const normalizedTicket = normalizeTicket(isEdit ? ticket : {}, { members });
  const dayId = isEdit && existingDays.includes(normalizedTicket.dayId)
    ? normalizedTicket.dayId
    : existingDays.includes(trimText(defaultDayId))
      ? trimText(defaultDayId)
      : existingDays[0] || '';
  const hasActiveMember = members.includes(trimText(activeMember));
  const audienceType = isEdit
    ? normalizedTicket.audienceType
    : hasActiveMember
      ? TICKET_AUDIENCE_TYPES.MEMBERS
      : TICKET_AUDIENCE_TYPES.ALL;
  const assignedMembers = isEdit
    ? normalizedTicket.assignedMembers
    : hasActiveMember ? [trimText(activeMember)] : [];

  return {
    title: isEdit ? normalizedTicket.title : '',
    ticketType: isEdit ? normalizedTicket.ticketType : TICKET_TYPES.ATTACHMENT,
    attachmentKind: normalizedTicket.attachmentKind,
    url: isEdit ? normalizedTicket.url : '',
    audienceType,
    assignedMembers,
    presenterMember: isEdit ? normalizedTicket.presenterMember : '',
    dayId,
    usageTime: isEdit ? normalizedTicket.usageTime : '',
    reminderMinutes: isEdit ? normalizedTicket.reminderMinutes : 0,
    appName: isEdit ? normalizedTicket.appName : '',
    appUrl: isEdit ? normalizedTicket.appUrl : '',
    fallbackUrl: isEdit ? normalizedTicket.fallbackUrl : '',
    orderNumber: isEdit ? normalizedTicket.orderNumber : '',
    requiresNetwork: isEdit ? normalizedTicket.requiresNetwork : false,
    requiresLogin: isEdit ? normalizedTicket.requiresLogin : false,
    dynamicCode: isEdit ? normalizedTicket.dynamicCode : false,
    usageDetails: isEdit ? normalizedTicket.usageDetails : '',
    memo: isEdit ? normalizedTicket.memo : '',
    instructions: isEdit ? normalizedTicket.instructions : '',
  };
};

export function TicketEditorModal({
  mode = 'create',
  ticket = null,
  members = [],
  existingDays = [],
  startDate = '',
  defaultDayId = '',
  activeMember = '',
  t = {},
  uploadProgress = null,
  onClose,
  onSubmit,
}) {
  const validMembers = useMemo(() => normalizeList(members), [members]);
  const validDays = useMemo(() => normalizeList(existingDays), [existingDays]);
  const isEdit = mode === 'edit';
  const [originalTicket] = useState(() => normalizeTicket(
    isEdit ? ticket : {},
    { members: validMembers },
  ));
  const originalAttachmentValid = isExistingAttachmentValid(originalTicket);
  const [form, setForm] = useState(() => getInitialForm({
    mode,
    ticket,
    members: validMembers,
    existingDays: validDays,
    defaultDayId,
    activeMember,
  }));
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [moreSettingsOpen, setMoreSettingsOpen] = useState(false);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState('');
  const isSubmittingRef = useRef(false);
  const titleInputRef = useRef(null);

  const theme = {
    modalBg: t?.modalBg || 'bg-white dark:bg-slate-950',
    headerBg: t?.headerBg || 'bg-white/95 dark:bg-slate-950/95',
    cardBorder: t?.cardBorder || 'border-slate-200 dark:border-white/10',
    mainText: t?.mainText || 'text-slate-950 dark:text-white',
    subText: t?.subText || 'text-slate-600 dark:text-slate-300',
    inputBg: t?.inputBg || 'bg-white dark:bg-slate-900',
  };

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frameId = window.requestAnimationFrame(() => titleInputRef.current?.focus());

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isSubmittingRef.current) {
        event.preventDefault();
        onClose?.();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frameId);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [onClose]);

  const clearError = (field) => {
    setErrors((previous) => ({ ...previous, [field]: '' }));
  };

  const updateField = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    clearError(field);
  };

  const setTicketType = (ticketType) => {
    setForm((previous) => ({ ...previous, ticketType }));
    setErrors((previous) => ({
      ...previous,
      file: '',
      url: '',
      appName: '',
      appUrl: '',
      fallbackUrl: '',
    }));
  };

  const setAudienceType = (audienceType) => {
    setForm((previous) => {
      let presenterMember = previous.presenterMember;
      if (audienceType === TICKET_AUDIENCE_TYPES.MEMBERS) {
        if (previous.assignedMembers.length <= 1
          || !previous.assignedMembers.includes(presenterMember)) presenterMember = '';
      } else if (!validMembers.includes(presenterMember)) {
        presenterMember = '';
      }
      return { ...previous, audienceType, presenterMember };
    });
    clearError('assignedMembers');
    clearError('presenterMember');
  };

  const toggleMember = (member) => {
    setForm((previous) => {
      const assignedMembers = previous.assignedMembers.includes(member)
        ? previous.assignedMembers.filter((item) => item !== member)
        : [...previous.assignedMembers, member];
      const presenterMember = assignedMembers.length > 1
        && assignedMembers.includes(previous.presenterMember)
        ? previous.presenterMember
        : '';
      return { ...previous, assignedMembers, presenterMember };
    });
    clearError('assignedMembers');
    clearError('presenterMember');
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    const fileError = validateTicketFile(file);
    if (fileError) {
      event.target.value = '';
      setSelectedFile(null);
      setErrors((previous) => ({ ...previous, file: fileError }));
      return;
    }

    setSelectedFile(file);
    setForm((previous) => ({
      ...previous,
      attachmentKind: getAttachmentKindFromFile(file),
    }));
    clearError('file');
  };

  const cancelFileReplacement = () => {
    setSelectedFile(null);
    setFileInputKey((previous) => previous + 1);
    setForm((previous) => ({
      ...previous,
      attachmentKind: originalTicket.ticketType === TICKET_TYPES.ATTACHMENT
        ? originalTicket.attachmentKind
        : '',
    }));
    clearError('file');
  };

  const presenterOptions = form.audienceType === TICKET_AUDIENCE_TYPES.ALL
    ? validMembers
    : form.assignedMembers;
  const showPresenter = form.audienceType === TICKET_AUDIENCE_TYPES.ALL
    || form.assignedMembers.length > 1;

  const validate = () => {
    const nextErrors = {};
    if (!trimText(form.title)) nextErrors.title = '請輸入票券名稱。';
    if (!form.dayId || !validDays.includes(form.dayId)) nextErrors.dayId = '請選擇有效的使用日期。';
    if (form.audienceType === TICKET_AUDIENCE_TYPES.MEMBERS
      && form.assignedMembers.length === 0) {
      nextErrors.assignedMembers = '指定成員時至少選擇一位旅程成員。';
    }
    if (form.presenterMember && !presenterOptions.includes(form.presenterMember)) {
      nextErrors.presenterMember = '主要出示人必須是此票券的合法使用成員。';
    }

    if (form.ticketType === TICKET_TYPES.ATTACHMENT) {
      if (selectedFile) {
        const fileError = validateTicketFile(selectedFile);
        if (fileError) nextErrors.file = fileError;
      } else if (!isEdit || originalTicket.ticketType !== TICKET_TYPES.ATTACHMENT
        || !originalAttachmentValid) {
        nextErrors.file = '請選擇圖片或 PDF 票券。';
      }
    }

    if (form.ticketType === TICKET_TYPES.WEB_LINK
      && !normalizeTicketHttpUrl(form.url)) {
      nextErrors.url = '請輸入有效的 HTTP 或 HTTPS 票券網址。';
    }

    if (form.ticketType === TICKET_TYPES.EXTERNAL_APP) {
      if (!trimText(form.appName)) nextErrors.appName = '請輸入 App 名稱。';
      if (trimText(form.appUrl) && !normalizeTicketHttpUrl(form.appUrl)) {
        nextErrors.appUrl = '票券開啟連結只接受 HTTP 或 HTTPS。';
      }
      if (trimText(form.fallbackUrl) && !normalizeTicketHttpUrl(form.fallbackUrl)) {
        nextErrors.fallbackUrl = '備用網頁連結只接受 HTTP 或 HTTPS。';
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const getAttachmentChange = () => {
    if (form.ticketType === TICKET_TYPES.ATTACHMENT) {
      if (selectedFile) return { action: 'replace', file: selectedFile };
      return { action: 'keep', file: null };
    }
    if (isEdit && originalTicket.ticketType === TICKET_TYPES.ATTACHMENT) {
      return { action: 'remove', file: null };
    }
    return { action: 'keep', file: null };
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmittingRef.current) return;
    if (!validate()) return;

    const attachmentChange = getAttachmentChange();
    const keepExistingAttachment = form.ticketType === TICKET_TYPES.ATTACHMENT
      && attachmentChange.action === 'keep';
    const owner = form.audienceType === TICKET_AUDIENCE_TYPES.ALL
      ? '所有人'
      : form.assignedMembers.length === 1 ? form.assignedMembers[0] : '';
    const draft = {
      id: isEdit ? originalTicket.id : '',
      title: form.title,
      ticketType: form.ticketType,
      attachmentKind: form.ticketType === TICKET_TYPES.ATTACHMENT
        ? selectedFile ? getAttachmentKindFromFile(selectedFile) : form.attachmentKind
        : '',
      url: form.ticketType === TICKET_TYPES.WEB_LINK
        ? form.url
        : keepExistingAttachment ? originalTicket.url : '',
      storagePath: keepExistingAttachment ? originalTicket.storagePath : '',
      audienceType: form.audienceType,
      assignedMembers: form.assignedMembers,
      presenterMember: showPresenter ? form.presenterMember : '',
      dayId: form.dayId,
      usageTime: form.usageTime,
      reminderMinutes: form.reminderMinutes,
      appName: form.ticketType === TICKET_TYPES.EXTERNAL_APP ? form.appName : '',
      appUrl: form.ticketType === TICKET_TYPES.EXTERNAL_APP ? form.appUrl : '',
      fallbackUrl: form.ticketType === TICKET_TYPES.EXTERNAL_APP ? form.fallbackUrl : '',
      orderNumber: form.ticketType === TICKET_TYPES.EXTERNAL_APP ? form.orderNumber : '',
      requiresNetwork: form.ticketType === TICKET_TYPES.EXTERNAL_APP && form.requiresNetwork,
      requiresLogin: form.ticketType === TICKET_TYPES.EXTERNAL_APP && form.requiresLogin,
      dynamicCode: form.ticketType === TICKET_TYPES.EXTERNAL_APP && form.dynamicCode,
      usageDetails: form.ticketType === TICKET_TYPES.EXTERNAL_APP ? form.usageDetails : '',
      memo: form.memo,
      instructions: form.ticketType === TICKET_TYPES.EXTERNAL_APP ? form.instructions : '',
      owner,
      createdAt: isEdit ? originalTicket.createdAt : null,
      updatedAt: isEdit ? originalTicket.updatedAt : null,
    };

    const payload = {
      ticket: normalizeTicket(draft, { members: validMembers }),
      attachmentChange,
    };

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setSubmissionError('');
    try {
      await onSubmit?.(payload);
    } catch {
      setSubmissionError('票券暫時無法儲存，請稍後再試。');
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const inputClass = `mt-1 w-full min-w-0 rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${theme.inputBg} ${theme.cardBorder} ${theme.mainText}`;
  const sectionClass = `rounded-2xl border p-4 ${theme.cardBorder}`;
  const errorMessages = Object.values(errors).filter(Boolean);
  const normalizedUploadProgress = uploadProgress === null
    || !Number.isFinite(Number(uploadProgress))
    ? null
    : Math.min(100, Math.max(0, Math.round(Number(uploadProgress))));

  return createPortal(
    <div
      data-testid="ticket-editor-modal"
      className="fixed inset-0 z-[10090] flex max-w-[100vw] items-end justify-center overflow-hidden bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="ticket-editor-title"
        className={`flex max-h-[94dvh] w-full min-w-0 max-w-2xl flex-col overflow-hidden rounded-t-3xl border shadow-2xl sm:max-h-[90dvh] sm:rounded-3xl ${theme.modalBg} ${theme.cardBorder}`}
      >
        <header className={`shrink-0 border-b px-5 py-4 sm:px-6 ${theme.headerBg} ${theme.cardBorder}`}>
          <h2 id="ticket-editor-title" className={`text-xl font-black ${theme.mainText}`}>
            {isEdit ? '編輯票券' : '新增票券'}
          </h2>
          <p className={`mt-1 text-xs font-semibold ${theme.subText}`}>
            先填必要資訊，需要時再展開更多設定。
          </p>
        </header>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit} noValidate>
          <div className="min-h-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto px-5 py-4 sm:px-6">
            <div className={sectionClass}>
              <p className={`text-sm font-black ${theme.mainText}`}>票券形式</p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {[
                  [TICKET_TYPES.ATTACHMENT, '上傳票券', 'ticket-type-attachment'],
                  [TICKET_TYPES.WEB_LINK, '網頁票券', 'ticket-type-web-link'],
                  [TICKET_TYPES.EXTERNAL_APP, '外部 App', 'ticket-type-external-app'],
                ].map(([value, label, testId]) => (
                  <button
                    key={value}
                    type="button"
                    data-testid={testId}
                    aria-pressed={form.ticketType === value}
                    onClick={() => setTicketType(value)}
                    className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-black ${form.ticketType === value ? 'border-blue-500 bg-blue-600 text-white' : `${theme.cardBorder} ${theme.mainText}`}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="ticket-editor-title-input" className={`text-sm font-black ${theme.mainText}`}>
                票券名稱 <span aria-hidden="true">*</span>
              </label>
              <input
                ref={titleInputRef}
                id="ticket-editor-title-input"
                data-testid="ticket-title-input"
                value={form.title}
                onChange={(event) => updateField('title', event.target.value)}
                aria-describedby={errors.title ? 'ticket-title-error' : undefined}
                aria-invalid={Boolean(errors.title)}
                className={inputClass}
              />
              <FieldError id="ticket-title-error" message={errors.title} />
            </div>

            <div>
              <label htmlFor="ticket-editor-day" className={`text-sm font-black ${theme.mainText}`}>
                使用日期 <span aria-hidden="true">*</span>
              </label>
              <select
                id="ticket-editor-day"
                data-testid="ticket-day-select"
                value={form.dayId}
                onChange={(event) => updateField('dayId', event.target.value)}
                disabled={validDays.length === 0}
                aria-describedby={errors.dayId || validDays.length === 0 ? 'ticket-day-error' : undefined}
                aria-invalid={Boolean(errors.dayId) || validDays.length === 0}
                className={inputClass}
              >
                {validDays.length === 0 ? <option value="">沒有可用的旅程日期</option> : null}
                {validDays.map((dayId, index) => (
                  <option key={dayId} value={dayId}>{formatDayLabel(dayId, startDate, index)}</option>
                ))}
              </select>
              {validDays.length === 0 ? (
                <p id="ticket-day-error" data-testid="ticket-days-empty-error" className="mt-1 text-xs font-bold text-red-600">
                  目前沒有可用的旅程日期，請先建立行程天數。
                </p>
              ) : <FieldError id="ticket-day-error" message={errors.dayId} />}
            </div>

            <fieldset className={sectionClass}>
              <legend className={`px-1 text-sm font-black ${theme.mainText}`}>使用成員</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 ${theme.cardBorder} ${theme.mainText}`}>
                  <input
                    type="radio"
                    name="ticket-audience"
                    data-testid="ticket-audience-all"
                    checked={form.audienceType === TICKET_AUDIENCE_TYPES.ALL}
                    onChange={() => setAudienceType(TICKET_AUDIENCE_TYPES.ALL)}
                  />
                  所有人共同使用
                </label>
                <label className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 ${theme.cardBorder} ${theme.mainText}`}>
                  <input
                    type="radio"
                    name="ticket-audience"
                    data-testid="ticket-audience-members"
                    checked={form.audienceType === TICKET_AUDIENCE_TYPES.MEMBERS}
                    onChange={() => setAudienceType(TICKET_AUDIENCE_TYPES.MEMBERS)}
                    aria-describedby={errors.assignedMembers ? 'ticket-members-error' : undefined}
                    aria-invalid={Boolean(errors.assignedMembers)}
                  />
                  指定成員
                </label>
              </div>
              {form.audienceType === TICKET_AUDIENCE_TYPES.MEMBERS ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {validMembers.map((member) => (
                    <label key={member} className={`flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-semibold ${theme.mainText}`}>
                      <input
                        type="checkbox"
                        data-testid={`ticket-member-${safeMemberTestId(member)}`}
                        checked={form.assignedMembers.includes(member)}
                        onChange={() => toggleMember(member)}
                        aria-describedby={errors.assignedMembers ? 'ticket-members-error' : undefined}
                        aria-invalid={Boolean(errors.assignedMembers)}
                      />
                      {member}
                    </label>
                  ))}
                </div>
              ) : null}
              <FieldError id="ticket-members-error" message={errors.assignedMembers} />
            </fieldset>

            {form.ticketType === TICKET_TYPES.ATTACHMENT ? (
              <div className={sectionClass}>
                <label htmlFor="ticket-editor-file" className={`text-sm font-black ${theme.mainText}`}>
                  {isEdit && originalAttachmentValid ? '更換附件' : '上傳附件'} <span aria-hidden="true">*</span>
                </label>
                {isEdit && originalTicket.ticketType === TICKET_TYPES.ATTACHMENT ? (
                  <p data-testid="ticket-existing-attachment-kind" className={`mt-1 text-xs font-semibold ${theme.subText}`}>
                    原附件類型：{originalTicket.attachmentKind === 'pdf' ? 'PDF' : originalTicket.attachmentKind === 'image' ? '圖片' : '無法辨識'}
                  </p>
                ) : null}
                <input
                  key={fileInputKey}
                  id="ticket-editor-file"
                  data-testid="ticket-file-input"
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileChange}
                  aria-describedby={errors.file ? 'ticket-file-error' : undefined}
                  aria-invalid={Boolean(errors.file)}
                  className={`mt-2 block w-full min-w-0 text-sm ${theme.mainText}`}
                />
                <p data-testid="ticket-file-status" className={`mt-2 text-xs font-semibold ${theme.subText}`}>
                  {selectedFile ? `已選擇新檔案：${selectedFile.name}` : isEdit && originalAttachmentValid ? '目前保留原附件' : '尚未選擇新檔案'}
                </p>
                {selectedFile ? (
                  <button
                    type="button"
                    data-testid="ticket-file-cancel-replacement"
                    onClick={cancelFileReplacement}
                    className="mt-2 text-sm font-black text-blue-600"
                  >
                    取消更換
                  </button>
                ) : null}
                <FieldError id="ticket-file-error" message={errors.file} />
                <p className={`mt-2 text-xs ${theme.subText}`}>接受 JPEG、PNG、WebP、GIF 或 PDF，最大 10 MB。</p>
              </div>
            ) : null}

            {form.ticketType === TICKET_TYPES.WEB_LINK ? (
              <div>
                <label htmlFor="ticket-editor-url" className={`text-sm font-black ${theme.mainText}`}>
                  票券網址 <span aria-hidden="true">*</span>
                </label>
                <input
                  id="ticket-editor-url"
                  data-testid="ticket-url-input"
                  type="url"
                  value={form.url}
                  onChange={(event) => updateField('url', event.target.value)}
                  placeholder="https://example.com/ticket"
                  aria-describedby={errors.url ? 'ticket-url-error' : undefined}
                  aria-invalid={Boolean(errors.url)}
                  className={inputClass}
                />
                <FieldError id="ticket-url-error" message={errors.url} />
              </div>
            ) : null}

            {form.ticketType === TICKET_TYPES.EXTERNAL_APP ? (
              <div className="space-y-4">
                <div>
                  <label htmlFor="ticket-editor-app-name" className={`text-sm font-black ${theme.mainText}`}>
                    App 名稱 <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id="ticket-editor-app-name"
                    data-testid="ticket-app-name-input"
                    value={form.appName}
                    onChange={(event) => updateField('appName', event.target.value)}
                    aria-describedby={errors.appName ? 'ticket-app-name-error' : undefined}
                    aria-invalid={Boolean(errors.appName)}
                    className={inputClass}
                  />
                  <FieldError id="ticket-app-name-error" message={errors.appName} />
                </div>
                <div>
                  <label htmlFor="ticket-editor-app-url" className={`text-sm font-black ${theme.mainText}`}>
                    票券開啟連結（選填）
                  </label>
                  <input
                    id="ticket-editor-app-url"
                    data-testid="ticket-app-url-input"
                    type="url"
                    value={form.appUrl}
                    onChange={(event) => updateField('appUrl', event.target.value)}
                    aria-describedby={errors.appUrl ? 'ticket-app-url-error' : undefined}
                    aria-invalid={Boolean(errors.appUrl)}
                    className={inputClass}
                  />
                  <FieldError id="ticket-app-url-error" message={errors.appUrl} />
                  <p data-testid="ticket-app-launch-preview" className={`mt-2 text-xs font-black ${form.appUrl ? 'text-blue-600' : theme.subText}`}>
                    {trimText(form.appUrl) ? '使用 App Link 開啟' : '手動開啟 App'}
                  </p>
                </div>
                <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-3 text-xs font-semibold leading-5 text-amber-800 dark:text-amber-200">
                  <p>請優先使用該 App 的「分享票券」或「複製連結」功能。</p>
                  <p>不要輸入帳號密碼、驗證碼、登入 Cookie 或付款資訊。</p>
                </div>
              </div>
            ) : null}

            <button
              type="button"
              data-testid="ticket-more-settings-toggle"
              aria-expanded={moreSettingsOpen}
              onClick={() => setMoreSettingsOpen((previous) => !previous)}
              className={`flex min-h-11 w-full items-center justify-between rounded-xl border px-4 text-sm font-black ${theme.cardBorder} ${theme.mainText}`}
            >
              更多設定
              <span aria-hidden="true">{moreSettingsOpen ? '−' : '+'}</span>
            </button>

            {moreSettingsOpen ? (
              <div data-testid="ticket-more-settings" className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="ticket-editor-usage-time" className={`text-sm font-black ${theme.mainText}`}>使用時間</label>
                    <input
                      id="ticket-editor-usage-time"
                      data-testid="ticket-usage-time-input"
                      type="time"
                      value={form.usageTime}
                      onChange={(event) => updateField('usageTime', event.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="ticket-editor-reminder" className={`text-sm font-black ${theme.mainText}`}>提前開啟時間</label>
                    <select
                      id="ticket-editor-reminder"
                      data-testid="ticket-reminder-select"
                      value={form.reminderMinutes}
                      onChange={(event) => updateField('reminderMinutes', Number(event.target.value))}
                      className={inputClass}
                    >
                      {REMINDER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <p className={`mt-1 text-xs ${theme.subText}`}>
                      此設定只會顯示建議提前時間，不會發送系統通知。
                    </p>
                  </div>
                </div>

                {showPresenter ? (
                  <div>
                    <label htmlFor="ticket-editor-presenter" className={`text-sm font-black ${theme.mainText}`}>主要出示人（選填）</label>
                    <select
                      id="ticket-editor-presenter"
                      data-testid="ticket-presenter-select"
                      value={form.presenterMember}
                      onChange={(event) => updateField('presenterMember', event.target.value)}
                      aria-describedby={errors.presenterMember ? 'ticket-presenter-error' : undefined}
                      aria-invalid={Boolean(errors.presenterMember)}
                      className={inputClass}
                    >
                      <option value="">不指定</option>
                      {presenterOptions.map((member) => <option key={member} value={member}>{member}</option>)}
                    </select>
                    <FieldError id="ticket-presenter-error" message={errors.presenterMember} />
                  </div>
                ) : null}

                <div>
                  <label htmlFor="ticket-editor-memo" className={`text-sm font-black ${theme.mainText}`}>備註</label>
                  <textarea
                    id="ticket-editor-memo"
                    data-testid="ticket-memo-input"
                    value={form.memo}
                    onChange={(event) => updateField('memo', event.target.value)}
                    className={inputClass}
                    rows={3}
                  />
                </div>

                {form.ticketType === TICKET_TYPES.EXTERNAL_APP ? (
                  <div className={`space-y-4 border-t pt-4 ${theme.cardBorder}`}>
                    <div>
                      <label htmlFor="ticket-editor-fallback-url" className={`text-sm font-black ${theme.mainText}`}>備用網頁連結（選填）</label>
                      <input
                        id="ticket-editor-fallback-url"
                        data-testid="ticket-fallback-url-input"
                        type="url"
                        value={form.fallbackUrl}
                        onChange={(event) => updateField('fallbackUrl', event.target.value)}
                        aria-describedby={errors.fallbackUrl ? 'ticket-fallback-url-error' : undefined}
                        aria-invalid={Boolean(errors.fallbackUrl)}
                        className={inputClass}
                      />
                      <FieldError id="ticket-fallback-url-error" message={errors.fallbackUrl} />
                    </div>
                    <div>
                      <label htmlFor="ticket-editor-order" className={`text-sm font-black ${theme.mainText}`}>訂單編號</label>
                      <input id="ticket-editor-order" data-testid="ticket-order-number-input" value={form.orderNumber} onChange={(event) => updateField('orderNumber', event.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label htmlFor="ticket-editor-usage-details" className={`text-sm font-black ${theme.mainText}`}>座位／車次／班次</label>
                      <textarea id="ticket-editor-usage-details" data-testid="ticket-usage-details-input" value={form.usageDetails} onChange={(event) => updateField('usageDetails', event.target.value)} className={inputClass} rows={2} />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {[
                        ['requiresNetwork', '需要網路', 'ticket-requires-network'],
                        ['requiresLogin', '需要登入', 'ticket-requires-login'],
                        ['dynamicCode', '動態條碼／禁止截圖', 'ticket-dynamic-code'],
                      ].map(([field, label, testId]) => (
                        <label key={field} className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${theme.cardBorder} ${theme.mainText}`}>
                          <input
                            type="checkbox"
                            data-testid={testId}
                            checked={form[field]}
                            onChange={(event) => updateField(field, event.target.checked)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <div>
                      <label htmlFor="ticket-editor-instructions" className={`text-sm font-black ${theme.mainText}`}>詳細使用說明</label>
                      <textarea id="ticket-editor-instructions" data-testid="ticket-instructions-input" value={form.instructions} onChange={(event) => updateField('instructions', event.target.value)} className={inputClass} rows={4} />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div data-testid="ticket-form-errors" aria-live="polite" className="sr-only">
              {errorMessages.length > 0 ? `表單有 ${errorMessages.length} 個欄位需要修正。` : ''}
            </div>
            <div
              data-testid="ticket-submission-error"
              aria-live="assertive"
              className={submissionError ? 'rounded-xl bg-red-500/10 p-3 text-sm font-bold text-red-600' : 'sr-only'}
            >
              {submissionError}
            </div>
            {normalizedUploadProgress !== null ? (
              <div className="space-y-1">
                <div className={`flex justify-between text-xs font-bold ${theme.subText}`}>
                  <span>附件上傳進度</span>
                  <span>{normalizedUploadProgress}%</span>
                </div>
                <div
                  data-testid="ticket-upload-progress"
                  role="progressbar"
                  aria-label="附件上傳進度"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-valuenow={normalizedUploadProgress}
                  className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10"
                >
                  <div
                    className="h-full rounded-full bg-blue-600 transition-[width]"
                    style={{ width: `${normalizedUploadProgress}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <footer
            className={`grid shrink-0 grid-cols-2 gap-3 border-t px-5 pt-3 sm:flex sm:justify-end sm:px-6 ${theme.headerBg} ${theme.cardBorder}`}
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            <button
              type="button"
              data-testid="ticket-cancel-button"
              onClick={() => onClose?.()}
              disabled={isSubmitting}
              className={`min-h-12 rounded-xl border px-5 text-sm font-black ${theme.cardBorder} ${theme.mainText}`}
            >
              取消
            </button>
            <button
              type="submit"
              data-testid="ticket-submit-button"
              disabled={validDays.length === 0 || isSubmitting}
              className="min-h-12 rounded-xl bg-blue-600 px-6 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSubmitting
                ? normalizedUploadProgress !== null
                  ? `上傳中 ${normalizedUploadProgress}%`
                  : '儲存中…'
                : isEdit ? '儲存變更' : '新增票券'}
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  );
}
