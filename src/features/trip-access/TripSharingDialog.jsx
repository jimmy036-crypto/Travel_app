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

export function TripSharingDialog({ open, roomId, role, onClose, client: suppliedClient, t = {} }) {
  const client = useMemo(() => suppliedClient || createTripAccessClient(), [suppliedClient]);
  const confirm = useConfirm();
  const toast = useToast();
  const [invite, setInvite] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionUid, setActionUid] = useState('');
  const [error, setError] = useState('');
  const loadRequestIdRef = useRef(0);
  const isOwner = role === 'owner';

  const load = useCallback(async () => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    if (!open || !roomId) {
      setInvite(null);
      setMembers([]);
      setLoading(false);
      setError('');
      return;
    }
    setLoading(true);
    setInvite(null);
    setMembers([]);
    setError('');
    try {
      const [inviteResult, memberResult] = await Promise.all([
        isOwner ? client.getOrCreateTripInvite(roomId) : Promise.resolve(null),
        isOwner ? client.listTripMembers(roomId) : Promise.resolve({ members: [] }),
      ]);
      if (loadRequestIdRef.current !== requestId) return;
      setInvite(inviteResult);
      setMembers(Array.isArray(memberResult?.members) ? memberResult.members : []);
    } catch (nextError) {
      if (loadRequestIdRef.current !== requestId) return;
      setError(getCallableErrorMessage(nextError));
    } finally {
      if (loadRequestIdRef.current === requestId) setLoading(false);
    }
  }, [client, isOwner, open, roomId]);

  useEffect(() => {
    void load();
    return () => {
      loadRequestIdRef.current += 1;
    };
  }, [load]);

  if (!open) return null;
  const inviteUrl = invite?.token ? buildInviteUrl(invite.token) : '';

  const copyInvite = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.info({ title: '邀請連結已複製' });
    } catch {
      window.prompt('請手動複製邀請連結：', inviteUrl);
    }
  };

  const rotateInvite = async () => {
    const approved = await confirm({
      title: '換發邀請連結？',
      description: '舊連結會立即失效，已加入的成員不受影響。',
      confirmText: '換發',
      cancelText: '取消',
    });
    if (!approved) return;
    setLoading(true);
    setError('');
    try {
      setInvite(await client.rotateTripInvite(roomId));
      toast.info({ title: '已換發邀請連結' });
    } catch (nextError) {
      setError(getCallableErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  };

  const revokeInvite = async () => {
    const approved = await confirm({
      title: '停用邀請連結？',
      description: '連結會立即失效，已加入的成員仍可繼續使用。',
      confirmText: '停用',
      cancelText: '取消',
      tone: 'danger',
    });
    if (!approved) return;
    setLoading(true);
    setError('');
    try {
      await client.revokeTripInvite(roomId);
      setInvite(null);
      toast.info({ title: '邀請連結已停用' });
    } catch (nextError) {
      setError(getCallableErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  };

  const changeMemberStatus = async (member) => {
    const restoring = member.status === 'removed';
    const approved = restoring || await confirm({
      title: `移除 ${member.displayName || '此成員'}？`,
      description: '對方會立即失去旅程與附件存取權，之後可由你手動恢復。',
      confirmText: '移除',
      cancelText: '取消',
      tone: 'danger',
    });
    if (!approved) return;
    setActionUid(member.uid);
    setError('');
    try {
      if (restoring) await client.restoreTripMember(roomId, member.uid);
      else await client.removeTripMember(roomId, member.uid);
      const result = await client.listTripMembers(roomId);
      setMembers(Array.isArray(result?.members) ? result.members : []);
      toast.info({ title: restoring ? '已恢復成員權限' : '已移除成員權限' });
    } catch (nextError) {
      setError(getCallableErrorMessage(nextError));
    } finally {
      setActionUid('');
    }
  };

  return (
    <ResponsiveBottomSheet
      onClose={onClose}
      labelledBy="trip-sharing-title"
      testId="trip-sharing-dialog"
      dataMode="sharing"
      initialFocusSelector="[data-testid='trip-sharing-close']"
      panelClassName={`${t.modalBg || 'bg-white'} ${t.cardBorder || 'border-slate-200'}`}
    >
      <div className={`flex items-start justify-between gap-4 border-b p-5 ${t.cardBorder || ''}`}>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-600">安全共編</p>
          <h2 id="trip-sharing-title" className={`mt-1 text-xl font-black ${t.mainText || ''}`}>邀請與成員</h2>
        </div>
        <button data-testid="trip-sharing-close" type="button" aria-label="關閉邀請與成員" onClick={onClose} className={`flex h-11 w-11 items-center justify-center rounded-xl text-xl ${t.mainText || ''}`}>×</button>
      </div>
      <div className="min-h-0 overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <section aria-labelledby="invite-link-title">
          <h3 id="invite-link-title" className={`font-black ${t.mainText || ''}`}>邀請連結</h3>
          <p className={`mt-1 text-xs font-semibold leading-5 ${t.subText || ''}`}>只有用 Google 登入並成功兌換連結的人才會加入旅程。請勿公開張貼。</p>
          {inviteUrl ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <input readOnly aria-label="旅程邀請連結" value={inviteUrl} className={`min-h-11 min-w-0 rounded-xl border px-3 text-sm ${t.inputBg || ''} ${t.cardBorder || ''} ${t.mainText || ''}`} />
              <Button data-testid="copy-trip-invite" onClick={copyInvite} variant="primary">複製</Button>
            </div>
          ) : (
            <p className={`mt-3 rounded-xl border p-3 text-sm ${t.cardBorder || ''} ${t.subText || ''}`}>
              {isOwner ? '邀請尚未啟用，可換發一組新連結。' : '只有旅程擁有者可以建立或查看邀請連結。'}
            </p>
          )}
          {isOwner ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button data-testid="rotate-trip-invite" onClick={rotateInvite} loading={loading} variant="secondary">{inviteUrl ? '換發連結' : '建立連結'}</Button>
              {inviteUrl ? <Button data-testid="revoke-trip-invite" onClick={revokeInvite} disabled={loading} variant="danger">停用連結</Button> : null}
            </div>
          ) : null}
        </section>

        {isOwner ? (
          <section aria-labelledby="trip-members-title" className={`mt-6 border-t pt-5 ${t.cardBorder || ''}`}>
            <h3 id="trip-members-title" className={`font-black ${t.mainText || ''}`}>旅程成員</h3>
            <div className="mt-3 grid gap-2">
              {members.map((member) => (
                <article key={member.uid} className={`flex min-w-0 items-center gap-3 rounded-2xl border p-3 ${t.cardBg || ''} ${t.cardBorder || ''}`}>
                  {member.photoURL ? <img src={member.photoURL} alt="" referrerPolicy="no-referrer" className="h-9 w-9 shrink-0 rounded-full" /> : <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white">{String(member.displayName || '旅').slice(0, 1)}</span>}
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm font-black ${t.mainText || ''}`}>{member.displayName || '旅伴'}</p>
                    <p className={`text-xs ${member.status === 'removed' ? 'text-red-600' : t.subText || ''}`}>{member.role === 'owner' ? '擁有者' : member.status === 'removed' ? '已移除' : '可共同編輯'}</p>
                  </div>
                  {member.role !== 'owner' ? (
                    <Button size="sm" variant={member.status === 'removed' ? 'secondary' : 'danger'} loading={actionUid === member.uid} onClick={() => changeMemberStatus(member)}>
                      {member.status === 'removed' ? '恢復' : '移除'}
                    </Button>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}
        {loading && !invite && members.length === 0 ? <p aria-live="polite" className={`mt-4 text-sm ${t.subText || ''}`}>正在載入分享設定…</p> : null}
        {error ? <p role="alert" className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm font-bold text-red-600">{error}</p> : null}
      </div>
    </ResponsiveBottomSheet>
  );
}
