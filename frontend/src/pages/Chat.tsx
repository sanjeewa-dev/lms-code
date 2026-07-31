import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useTenantApi } from '../hooks/useTenantApi';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../api/client';
import { Button, Modal, Spinner } from '../components/ui';
import { Icon } from '../components/icons';
import { PageHeader } from '../components/tenant/TenantUi';
import type { ChatContact, ChatConversation, ChatMessage, ChatPeerClass } from '../api/types';

function formatWhen(iso: string) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
      return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function classLabel(classes: ChatPeerClass[] | undefined) {
  if (!classes?.length) return null;
  return classes.map((c) => c.title).join(', ');
}

export default function Chat() {
  const t = useTenantApi();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const activeId = params.get('c');
  const isStudent = user?.role === 'student';
  const isStaff = user?.role === 'teacher' || user?.role === 'admin';

  const [showNew, setShowNew] = useState(false);
  const [contactQ, setContactQ] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [listClassFilter, setListClassFilter] = useState('');
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const conversationsQuery = useQuery({
    queryKey: ['chat-conversations', t.slug],
    queryFn: async () =>
      (await t.get<{ conversations: ChatConversation[] }>('/chat/conversations')).data.conversations,
    refetchInterval: 10_000,
  });

  const contactsQuery = useQuery({
    queryKey: ['chat-contacts', t.slug, contactQ, classFilter],
    enabled: showNew,
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (contactQ.trim()) qs.set('q', contactQ.trim());
      if (classFilter) qs.set('classId', classFilter);
      const suffix = qs.toString() ? `?${qs}` : '';
      return (
        await t.get<{ contacts: ChatContact[]; filterClasses: ChatPeerClass[] }>(
          `/chat/contacts${suffix}`
        )
      ).data;
    },
  });

  const messagesQuery = useQuery({
    queryKey: ['chat-messages', t.slug, activeId],
    enabled: Boolean(activeId),
    queryFn: async () =>
      (
        await t.get<{ messages: ChatMessage[] }>(`/chat/conversations/${activeId}/messages`)
      ).data.messages,
    refetchInterval: activeId ? 3_000 : false,
  });

  const startMutation = useMutation({
    mutationFn: async (peerId: string) =>
      (await t.post<{ conversation: ChatConversation }>('/chat/conversations', { peerId })).data
        .conversation,
    onSuccess: (conversation) => {
      setShowNew(false);
      setContactQ('');
      setClassFilter('');
      qc.invalidateQueries({ queryKey: ['chat-conversations', t.slug] });
      qc.invalidateQueries({ queryKey: ['chat-unread', t.slug] });
      setParams({ c: conversation.id }, { replace: true });
    },
    onError: (e) => setSendError(apiErrorMessage(e)),
  });

  const sendMutation = useMutation({
    mutationFn: async (body: string) =>
      (
        await t.post<{ message: ChatMessage }>(`/chat/conversations/${activeId}/messages`, { body })
      ).data.message,
    onSuccess: (message) => {
      setDraft('');
      setSendError('');
      qc.setQueryData<ChatMessage[]>(['chat-messages', t.slug, activeId], (prev) => [
        ...(prev ?? []),
        message,
      ]);
      qc.setQueryData<ChatConversation[]>(['chat-conversations', t.slug], (prev) => {
        if (!prev || !activeId) return prev;
        const next = prev.map((c) =>
          c.id === activeId
            ? {
                ...c,
                lastMessage: {
                  body: message.body,
                  createdAt: message.createdAt,
                  senderId: message.senderId,
                },
                lastMessageAt: message.createdAt,
              }
            : c
        );
        return [...next].sort((a, b) => {
          const at = a.lastMessageAt ?? a.createdAt;
          const bt = b.lastMessageAt ?? b.createdAt;
          return bt.localeCompare(at);
        });
      });
      qc.invalidateQueries({ queryKey: ['chat-conversations', t.slug] });
      qc.invalidateQueries({ queryKey: ['chat-unread', t.slug] });
    },
    onError: (e) => setSendError(apiErrorMessage(e)),
  });

  const conversations = useMemo(() => {
    const list = (conversationsQuery.data ?? []).filter(
      (c) => Boolean(c.lastMessageAt || c.lastMessage)
    );
    return [...list].sort((a, b) => {
      const at = a.lastMessageAt ?? a.createdAt;
      const bt = b.lastMessageAt ?? b.createdAt;
      return bt.localeCompare(at);
    });
  }, [conversationsQuery.data]);
  const listFilterOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of conversations) {
      for (const cls of c.peerClasses ?? []) {
        map.set(cls.id, cls.title);
      }
    }
    return [...map.entries()]
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [conversations]);

  const visibleConversations = useMemo(() => {
    if (!listClassFilter) return conversations;
    return conversations.filter((c) =>
      (c.peerClasses ?? []).some((cls) => cls.id === listClassFilter)
    );
  }, [conversations, listClassFilter]);

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const messages = messagesQuery.data ?? [];
  const activeClasses = classLabel(active?.peerClasses);
  const filterClasses = contactsQuery.data?.filterClasses ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeId]);

  useEffect(() => {
    if (activeId) {
      qc.invalidateQueries({ queryKey: ['chat-conversations', t.slug] });
      qc.invalidateQueries({ queryKey: ['chat-unread', t.slug] });
    }
  }, [activeId, qc, t.slug, messages.length]);

  const selectConversation = (id: string) => {
    setParams({ c: id }, { replace: true });
    setSendError('');
  };

  const clearActiveConversation = () => {
    const next = new URLSearchParams(params);
    next.delete('c');
    setParams(next, { replace: true });
    setSendError('');
  };

  const onSend = () => {
    const body = draft.trim();
    if (!body || !activeId || sendMutation.isPending) return;
    sendMutation.mutate(body);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        icon="chat"
        tone="sky"
        title="Chat"
        subtitle="Message teachers and students. History is saved automatically."
        action={
          <button
            type="button"
            onClick={() => {
              setShowNew(true);
              setSendError('');
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            <span className="text-lg leading-none">+</span> New chat
          </button>
        }
      />

      {sendError && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-300">
          {sendError}
        </p>
      )}

      <div className="grid min-h-[520px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/5 dark:bg-ink-850 lg:grid-cols-[300px_1fr]">
        {/* Conversation list — mobile: only when no thread selected */}
        <aside
          className={`border-b border-slate-100 dark:border-white/5 lg:block lg:border-b-0 lg:border-r ${
            activeId ? 'hidden' : 'block'
          }`}
        >
          <div className="space-y-2 border-b border-slate-100 px-4 py-3 dark:border-white/5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Conversations</p>
            {listFilterOptions.length > 0 && (
              <select
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-brand-400 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                value={listClassFilter}
                onChange={(e) => setListClassFilter(e.target.value)}
                aria-label="Filter conversations by class"
              >
                <option value="">All classes</option>
                {listFilterOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            )}
          </div>
          {conversationsQuery.isLoading ? (
            <div className="p-6">
              <Spinner />
            </div>
          ) : visibleConversations.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">
              {conversations.length === 0
                ? 'No conversations yet. Start a new chat.'
                : 'No conversations in this class.'}
            </p>
          ) : (
            <ul className="max-h-[calc(520px-88px)] overflow-y-auto">
              {visibleConversations.map((c) => {
                const selected = c.id === activeId;
                const classes = classLabel(c.peerClasses);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => selectConversation(c.id)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition ${
                        selected
                          ? 'bg-brand-50 dark:bg-brand-900/20'
                          : 'hover:bg-slate-50 dark:hover:bg-white/5'
                      }`}
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sky-100 text-xs font-bold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                        {initials(c.peer.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                            {c.peer.name}
                          </p>
                          {c.lastMessageAt && (
                            <span className="shrink-0 text-[10px] text-slate-400">
                              {formatWhen(c.lastMessageAt)}
                            </span>
                          )}
                        </div>
                        {classes && (
                          <p className="mt-0.5 truncate text-[11px] font-medium text-sky-700 dark:text-sky-300">
                            {classes}
                          </p>
                        )}
                        <div className="mt-0.5 flex items-center justify-between gap-2">
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {c.lastMessage?.body ?? 'No messages yet'}
                          </p>
                          {c.unreadCount > 0 && (
                            <span className="shrink-0 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                              {c.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* Thread — mobile: only when a conversation is active */}
        <section
          className={`min-h-[360px] flex-col lg:flex ${activeId ? 'flex' : 'hidden'}`}
        >
          {!activeId ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sky-100 text-sky-600">
                <Icon name="chat" width={22} height={22} />
              </span>
              <p className="font-semibold text-slate-900 dark:text-white">Select a conversation</p>
              <p className="max-w-sm text-sm text-slate-500">
                Choose someone from the list, or start a new chat. Students can only message their class
                teachers.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-white/5">
                <button
                  type="button"
                  onClick={clearActiveConversation}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 lg:hidden dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                  aria-label="Back to conversations"
                >
                  <Icon name="chevron" width={14} height={14} className="rotate-180" />
                  Back
                </button>
                <span className="grid h-9 w-9 place-items-center rounded-full bg-sky-100 text-xs font-bold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                  {initials(active?.peer.name ?? '?')}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900 dark:text-white">
                    {active?.peer.name ?? 'Loading…'}
                  </p>
                  {activeClasses ? (
                    <p className="truncate text-xs font-medium text-sky-700 dark:text-sky-300">
                      {isStaff ? `Class: ${activeClasses}` : activeClasses}
                    </p>
                  ) : (
                    <p className="truncate text-xs text-slate-400">{active?.peer.email}</p>
                  )}
                  {activeClasses && active?.peer.email && (
                    <p className="truncate text-[11px] text-slate-400">{active.peer.email}</p>
                  )}
                </div>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50/60 px-4 py-4 dark:bg-white/[0.02]">
                {messagesQuery.isLoading ? (
                  <div className="flex justify-center py-10">
                    <Spinner />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="py-10 text-center text-sm text-slate-400">
                    No messages yet. Say hello.
                  </p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                          m.mine
                            ? 'rounded-br-md bg-brand-600 text-white'
                            : 'rounded-bl-md border border-slate-200 bg-white text-slate-800 dark:border-white/10 dark:bg-ink-800 dark:text-slate-100'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <p
                          className={`mt-1 text-[10px] ${
                            m.mine ? 'text-white/70' : 'text-slate-400'
                          }`}
                        >
                          {formatWhen(m.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={bottomRef} />
              </div>

              <div className="border-t border-slate-100 p-3 dark:border-white/5">
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-white/10 dark:bg-white/5 dark:text-white"
                    placeholder="Type a message…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        onSend();
                      }
                    }}
                    maxLength={2000}
                  />
                  <Button
                    disabled={!draft.trim() || sendMutation.isPending}
                    onClick={onSend}
                    className="!rounded-xl"
                  >
                    {sendMutation.isPending ? '…' : 'Send'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      <Modal
        open={showNew}
        onClose={() => {
          setShowNew(false);
          setClassFilter('');
          setContactQ('');
        }}
        title="New chat"
      >
        <p className="-mt-2 mb-3 text-xs text-slate-500">
          {isStudent ? 'Choose a teacher to message' : 'Choose a student to message'}
        </p>
        {(isStudent || isStaff) && (
          <select
            className="mb-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            aria-label="Filter by class"
          >
            <option value="">{isStudent ? 'All my classes' : 'All classes'}</option>
            {filterClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        )}
        <input
          className="mb-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          placeholder="Search by name or email…"
          value={contactQ}
          onChange={(e) => setContactQ(e.target.value)}
        />
        {contactsQuery.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : !(contactsQuery.data?.contacts.length) ? (
          <p className="py-8 text-center text-sm text-slate-400">No contacts found.</p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {contactsQuery.data.contacts.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  disabled={startMutation.isPending}
                  onClick={() => startMutation.mutate(c.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-white/5"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                    {initials(c.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {c.name}
                    </p>
                    <p className="truncate text-xs text-slate-400">{c.subtitle ?? c.email}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}
