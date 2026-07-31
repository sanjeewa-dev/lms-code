import { useState } from 'react';
import { JitsiMeeting } from '@jitsi/react-sdk';
import { Button, Modal } from './ui';
import { Icon } from './icons';

interface LiveClassRoomProps {
  roomName: string;
  jitsiHost: string;
  jwt: string | null;
  displayName: string;
  isModerator: boolean;
  className: string;
  onEnd?: (recordingUrl: string | null) => void;
  onLeave?: () => void;
}

export function LiveClassRoom({
  roomName,
  jitsiHost,
  jwt,
  displayName,
  isModerator,
  className,
  onEnd,
  onLeave,
}: LiveClassRoomProps) {
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState('');

  const jitsiConfig = {
    startWithAudioMuted: false,
    startWithVideoMuted: false,
    disableDeepLinking: true,
    prejoinPageEnabled: false,
    toolbarButtons: [
      'microphone',
      'camera',
      'closedcaptions',
      'desktop',
      'fullscreen',
      'fodeviceselection',
      'hangup',
      'chat',
      'recording',
      'raisehand',
      'videoquality',
      'filmstrip',
      'tileview',
      'videobackgroundblur',
      'whiteboard',
    ],
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-slate-900 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            LIVE
          </span>
          <span className="font-semibold text-white">{className}</span>
        </div>
        <div className="flex items-center gap-2">
          {isModerator ? (
            <button
              type="button"
              onClick={() => setShowEndConfirm(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
            >
              <Icon name="live" width={14} height={14} />
              End class
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onLeave?.()}
              className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Leave class
            </button>
          )}
        </div>
      </div>

      {/* Jitsi iframe */}
      <div className="min-h-0 flex-1">
        <JitsiMeeting
          domain={jitsiHost}
          roomName={roomName}
          jwt={jwt ?? undefined}
          configOverwrite={jitsiConfig}
          interfaceConfigOverwrite={{
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            TOOLBAR_ALWAYS_VISIBLE: true,
          }}
          userInfo={{ displayName, email: '' }}
          onApiReady={() => undefined}
          onReadyToClose={() => {
            if (isModerator) setShowEndConfirm(true);
            else onLeave?.();
          }}
          getIFrameRef={(iframeRef) => {
            iframeRef.style.height = '100%';
            iframeRef.style.width = '100%';
          }}
        />
      </div>

      <Modal
        open={showEndConfirm}
        onClose={() => setShowEndConfirm(false)}
        title="End live class?"
        className="max-w-md"
      >
        <p className="-mt-1 text-sm text-slate-500 dark:text-slate-400">
          This will close the session for all students. Optionally paste a recording link first.
        </p>
        <div className="mt-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Recording URL (optional)
          </label>
          <input
            type="url"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-white/10 dark:bg-white/5 dark:text-white"
            placeholder="https://drive.google.com/..."
            value={recordingUrl}
            onChange={(e) => setRecordingUrl(e.target.value)}
          />
        </div>
        <div className="mt-5 flex gap-3">
          <Button
            className="!bg-red-600 hover:!bg-red-700"
            onClick={() => {
              onEnd?.(recordingUrl.trim() || null);
              setShowEndConfirm(false);
            }}
          >
            End class
          </Button>
          <Button variant="secondary" onClick={() => setShowEndConfirm(false)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  );
}
