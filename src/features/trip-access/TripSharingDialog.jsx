import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ResponsiveBottomSheet } from '../../components/ResponsiveBottomSheet.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { useConfirm } from '../../components/ui/useConfirm.js';
import { useToast } from '../../components/ui/useToast.js';
import { createTripAccessClient, getCallableErrorMessage } from './tripAccessClient.js';

const buildInviteUrl = (token) => {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.hash = new URLSearchParams({ invite: token }).toString();
  return url.toString();
};

export function TripSharingDialog({ open, roomId, role, onClose, returnFocusTarget, client: suppliedClient, t = {} }) {
  const client = useMemo(() => suppliedClient || createTripAccessClient(), [suppliedClient]);
  const confirm = useConfirm();
  const toast = useToast();
  const [invite, setInvite] = useState(null);
  const [members, setMembers] = useState([]);
  const [loadState, setLoadState] = useState('idle');
  const [pendingAction, setPendingAction] = useState('');
  const [error, setError] = useState('');
  const [copyError, setCopyError] = useState('');
  const inviteInputRef = useRef(null);
  const loadRequestIdRef = useRef(0);
  const loadOperationRef = useRef(null);
  const activeActionRef = useRef(null);
  const actionContextRef = useRef(null);
  const isOwner = role === 'owner';
  actionContextRef.current = { client, isOwner, open, role, roomId };

  useEffect(() => {
    activeActionRef.current = null;
    setPendingAction('');
    setCopyError('');
    return () => {
      activeActionRef.current = null;
    };
  }, [client, open, role, roomId]);

  const load = useCallback(async () => {
    const previousLoad = loadOperationRef.current;
    if (
      previousLoad
      && previousLoad.client === client
      && previousLoad.isOwner === isOwner
      && previousLoad.open === open
      && previousLoad.roomId === roomId
    ) return;
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    if (!open || !roomId) {
      loadOperationRef.current = null;
      setInvite(null);
      setMembers([]);
      setLoadState('idle');
      setError('');
      setCopyError('');
      return;
    }
    const operation = { client, isOwner, open, requestId, roomId };
    loadOperationRef.current = operation;
    setLoadState('loading');
    setInvite(null);
    setMembers([]);
    setError('');
    setCopyError('');
    try {
      const [inviteResult, memberResult] = await Promise.all([
        isOwner ? client.getOrCreateTripInvite(roomId) : Promise.resolve(null),
        isOwner ? client.listTripMembers(roomId) : Promise.resolve({ members: [] }),
      ]);
      if (loadRequestIdRef.current !== requestId) return;
      setInvite(inviteResult);
      setMembers(Array.isArray(memberResult?.members) ? memberResult.members : []);
      setLoadState('success');
    } catch (nextError) {
      if (loadRequestIdRef.current !== requestId) return;
      setError(getCallableErrorMessage(nextError));
      setLoadState('error');
    } finally {
      if (loadOperationRef.current === operation) loadOperationRef.current = null;
    }
  }, [client, isOwner, open, roomId]);

  useEffect(() => {
    void load();
    return () => {
      loadRequestIdRef.current += 1;
      loadOperationRef.current = null;
    };
  }, [load]);

  if (!open) return null;
  const inviteUrl = isOwner && invite?.token ? buildInviteUrl(invite.token) : '';
  const loadPending = loadState === 'idle' || loadState === 'loading';
  const actionPending = Boolean(pendingAction);
  const controlsDisabled = loadPending || actionPending;
  const themedButtonClass = `${t.cardBg || 'bg-white/75'} ${t.cardBorder || 'border-slate-300/70'} ${t.mainText || 'text-slate-800'}`;
  const dangerButtonClass = t.isLight === false
    ? 'border-red-700 bg-red-950 text-red-200 hover:bg-red-900'
    : 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100';
  const errorClass = t.isLight === false ? 'text-red-200' : 'text-red-800';

  const beginAction = (name) => {
    if (!isOwner || !open || !roomId || loadPending || activeActionRef.current) return null;
    const operation = { client, name, role, roomId };
    activeActionRef.current = operation;
    setPendingAction(name);
    setError('');
    if (name !== 'copy') setCopyError('');
    return operation;
  };

  const isCurrentAction = (operation) => {
    const context = actionContextRef.current;
    return activeActionRef.current === operation
      && context?.client === operation.client
      && context?.isOwner
      && context?.open
      && context?.role === operation.role
      && context?.roomId === operation.roomId;
  };

  const finishAction = (operation) => {
    if (!isCurrentAction(operation)) return;
    activeActionRef.current = null;
    setPendingAction('');
  };

  const copyInvite = async () => {
    if (!inviteUrl) return;
    const operation = beginAction('copy');
    if (!operation) return;
    setCopyError('');
    try {
      if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(inviteUrl);
      if (!isCurrentAction(operation)) return;
      toast.info({ title: '邀請連結已複製' });
    } catch {
      if (!isCurrentAction(operation)) return;
      setCopyError('無法自動複製；連結已選取，請使用裝置的複製指令。');
      const requestId = loadRequestIdRef.current;
      window.requestAnimationFrame(() => {
        if (loadRequestIdRef.current !== requestId) return;
        inviteInputRef.current?.focus();
        inviteInputRef.current?.select();
      });
    } finally {
      finishAction(operation);
    }
  };

  const rotateInvite = async () => {
    const operation = beginAction('rotate');
    if (!operation) return;
    try {
      const approved = await confirm({
        title: '換發邀請連結？',
        description: '舊連結會立即失效，已加入的成員不受影響。',
        confirmLabel: '換發',
        cancelLabel: '取消',
      });
      if (!isCurrentAction(operation) || !approved) return;
      const nextInvite = await operation.client.rotateTripInvite(operation.roomId);
      if (!isCurrentAction(operation)) return;
      setInvite(nextInvite);
      toast.info({ title: '已換發邀請連結' });
    } catch (nextError) {
      if (!isCurrentAction(operation)) return;
      setError(getCallableErrorMessage(nextError));
    } finally {
      finishAction(operation);
    }
  };

  const revokeInvite = async () => {
    const operation = beginAction('revoke');
    if (!operation) return;
    try {
      const approved = await confirm({
        title: '停用邀請連結？',
        description: '連結會立即失效，已加入的成員仍可繼續使用。',
        confirmLabel: '停用',
        cancelLabel: '取消',
        danger: true,
      });
      if (!isCurrentAction(operation) || !approved) return;
      await operation.client.revokeTripInvite(operation.roomId);
      if (!isCurrentAction(operation)) return;
      setInvite(null);
      toast.info({ title: '邀請連結已停用' });
    } catch (nextError) {
      if (!isCurrentAction(operation)) return;
      setError(getCallableErrorMessage(nextError));
    } finally {
      finishAction(operation);
    }
  };

  const changeMemberStatus = async (member) => {
    const restoring = member.status === 'removed';
    const actionName = `member:${member.uid}`;
    const operation = beginAction(actionName);
    if (!operation) return;
    try {
      const approved = restoring || await confirm({
        title: `移除 ${member.displayName || '此成員'}？`,
        description: '對方會立即失去旅程與附件存取權，之後可由你手動恢復。',
        confirmLabel: '移除',
        cancelLabel: '取消',
        danger: true,
      });
      if (!isCurrentAction(operation) || !approved) return;
      if (restoring) await operation.client.restoreTripMember(operation.roomId, member.uid);
      else await operation.client.removeTripMember(operation.roomId, member.uid);
      if (!isCurrentAction(operation)) return;
      const result = await operation.client.listTripMembers(operation.roomId);
      if (!isCurrentAction(operation)) return;
      setMembers(Array.isArray(result?.members) ? result.members : []);
      toast.info({ title: restoring ? '已恢復成員權限' : '已移除成員權限' });
    } catch (nextError) {
      if (!isCurrentAction(operation)) return;
      setError(getCallableErrorMessage(nextError));
    } finally {
      finishAction(operation);
    }
  };

  return (
    <ResponsiveBottomSheet
      onClose={onClose}
      returnFocusTarget={returnFocusTarget}
      labelledBy="trip-sharing-title"
      testId="trip-sharing-dialog"
      dataMode="sharing"
      initialFocusSelector="[data-testid='trip-sharing-close']"
      panelClassName={`${t.modalBg || 'bg-white'} ${t.cardBorder || 'border-slate-200'}`}
    >
      <div className={`flex items-start justify-between gap-4 border-b p-5 ${t.cardBorder || ''}`}>
        <div>
          <p className={`text-xs font-black uppercase tracking-[0.14em] ${t.isLight === false ? 'text-blue-200' : 'text-blue-700'}`}>安全共編</p>
          <h2 id="trip-sharing-title" className={`mt-1 text-xl font-black ${t.mainText || ''}`}>邀請與成員</h2>
        </div>
        <button data-testid="trip-sharing-close" type="button" aria-label="關閉邀請與成員" onClick={onClose} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ${t.mainText || ''}`}>×</button>
      </div>
      <div className="min-h-0 overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <section aria-labelledby="invite-link-title">
          <h3 id="invite-link-title" className={`font-black ${t.mainText || ''}`}>邀請連結</h3>
          <p className={`mt-1 text-sm font-semibold leading-6 ${t.subText || ''}`}>只有用 Google 登入並成功兌換連結的人才會加入旅程。請勿公開張貼。</p>
          {loadPending && isOwner ? (
            <p role="status" aria-live="polite" className={`mt-3 rounded-xl border p-3 text-sm ${t.cardBorder || ''} ${t.subText || ''}`}>正在載入分享設定…</p>
          ) : loadState === 'error' && isOwner ? (
            <div className={`mt-3 rounded-xl border p-3 ${t.cardBorder || ''}`}>
              <p className={`text-sm font-semibold ${t.subText || ''}`}>分享設定載入失敗，請重新載入。</p>
              <Button
                data-testid="retry-trip-sharing-load"
                onClick={load}
                variant="themed"
                className={`mt-3 ${themedButtonClass}`}
              >
                重新載入分享設定
              </Button>
            </div>
          ) : inviteUrl ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                ref={inviteInputRef}
                readOnly
                aria-label="旅程邀請連結"
                aria-describedby={copyError ? 'trip-invite-copy-error' : undefined}
                value={inviteUrl}
                className={`min-h-11 min-w-0 rounded-xl border px-3 text-sm ${t.inputBg || ''} ${t.cardBorder || ''} ${t.mainText || ''}`}
              />
              <Button data-testid="copy-trip-invite" onClick={copyInvite} loading={pendingAction === 'copy'} disabled={controlsDisabled} variant="primary">複製</Button>
            </div>
          ) : (
            <p className={`mt-3 rounded-xl border p-3 text-sm ${t.cardBorder || ''} ${t.subText || ''}`}>
              {isOwner ? '邀請目前未啟用。建立後即可提供安全連結。' : '只有旅程擁有者可以建立或查看邀請連結。'}
            </p>
          )}
          {copyError && inviteUrl ? <p id="trip-invite-copy-error" role="alert" className={`mt-2 rounded-xl bg-red-500/10 p-3 text-sm font-bold ${errorClass}`}>{copyError}</p> : null}
          {isOwner && loadState === 'success' ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                data-testid="rotate-trip-invite"
                onClick={rotateInvite}
                loading={pendingAction === 'rotate'}
                disabled={controlsDisabled}
                variant="themed"
                className={themedButtonClass}
              >
                {inviteUrl ? '換發連結' : '建立連結'}
              </Button>
              {inviteUrl ? <Button data-testid="revoke-trip-invite" onClick={revokeInvite} loading={pendingAction === 'revoke'} disabled={controlsDisabled} variant="themed" className={dangerButtonClass}>停用連結</Button> : null}
            </div>
          ) : null}
        </section>

        {isOwner && loadState === 'success' ? (
          <section aria-labelledby="trip-members-title" className={`mt-6 border-t pt-5 ${t.cardBorder || ''}`}>
            <h3 id="trip-members-title" className={`font-black ${t.mainText || ''}`}>旅程成員</h3>
            <p className={`mt-1 text-sm leading-6 ${t.subText || ''}`}>這是具存取權的帳號，與行程中的旅伴名單不同。</p>
            <div className="mt-3 grid gap-2">
              {members.length > 0 ? members.map((member) => (
                <article key={member.uid} className={`flex min-w-0 items-center gap-3 rounded-2xl border p-3 ${t.cardBg || ''} ${t.cardBorder || ''}`}>
                  {member.photoURL ? <img src={member.photoURL} alt="" referrerPolicy="no-referrer" className="h-9 w-9 shrink-0 rounded-full" /> : <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white">{String(member.displayName || '旅').slice(0, 1)}</span>}
                  <div className="min-w-0 flex-1">
                    <p className={`break-words text-sm font-black leading-5 [overflow-wrap:anywhere] ${t.mainText || ''}`}>{member.displayName || '旅伴'}</p>
                    <p className={`text-sm leading-5 ${member.status === 'removed' ? errorClass : t.subText || ''}`}>{member.role === 'owner' ? '擁有者' : member.status === 'removed' ? '已移除' : '可共同編輯'}</p>
                  </div>
                  {member.role !== 'owner' ? (
                    <Button
                      size="sm"
                      variant="themed"
                      className={member.status === 'removed' ? themedButtonClass : dangerButtonClass}
                      aria-label={`${member.status === 'removed' ? '恢復' : '移除'}成員：${member.displayName || '旅伴'}`}
                      loading={pendingAction === `member:${member.uid}`}
                      disabled={controlsDisabled}
                      onClick={() => changeMemberStatus(member)}
                    >
                      {member.status === 'removed' ? '恢復' : '移除'}
                    </Button>
                  ) : null}
                </article>
              )) : <p className={`rounded-xl border p-3 text-sm ${t.cardBorder || ''} ${t.subText || ''}`}>目前沒有可管理的帳號成員。</p>}
            </div>
          </section>
        ) : null}
        {error ? <p role="alert" className={`mt-4 rounded-xl bg-red-500/10 p-3 text-sm font-bold ${errorClass}`}>{error}</p> : null}
      </div>
    </ResponsiveBottomSheet>
  );
}
