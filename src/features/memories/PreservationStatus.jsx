import React from 'react';

export function PreservationStatus({ summary, error = '' }) {
  let label = '尚未永久保存';
  if (error) label = error;
  else if (summary?.state === 'complete') label = '已永久保存';
  else if (summary?.state === 'partial') label = `照片尚未全部保存（${summary.saved || 0}/${summary.total || 0}）`;
  else if (['queued', 'copying'].includes(summary?.state)) label = `照片保存中（${summary.saved || 0}/${summary.total || 0}）`;
  else if (summary?.state === 'deleting') label = '正在刪除個人回憶…';
  else if (summary?.state === 'deleted') label = '個人回憶已刪除';
  return <p className="journal-preservation" role="status">{label}</p>;
}
