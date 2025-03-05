import { ref, toRaw, unref } from 'vue';
import { check, type Update, type DownloadEvent } from '@tauri-apps/plugin-updater';
import { bytesToSize } from '@/libs/utils';

export enum UpdateStage {
    CHECK = 'check',
    DOWNLOAD = 'download',
    INSTALL = 'install'
}

export enum UpdateType {
    DEFAULT = 'default',
    INFO = 'info',
    SUCCESS = 'success',
    ERROR = 'error'
}

export interface UpdateState {
    btn: string;
    stage: UpdateStage;
    haveUpdate: boolean;
    latestVersion: string;
    latestNote: string;
    latestDate: string;
    working: boolean;
    event: Update | null;
    total: number;
    downloaded: number;
    type: UpdateType;
}

export function useUpdater() {
    const state = ref<UpdateState>({
        btn: '检查更新',
        stage: UpdateStage.CHECK,
        haveUpdate: false,
        latestVersion: '',
        latestNote: '',
        latestDate: '',
        working: false,
        event: null,
        total: 0,
        downloaded: 0,
        type: UpdateType.DEFAULT
    });

    const handleDownloadProgress = (event: DownloadEvent) => {
        switch (event.event) {
            case 'Started':
                state.value.total = event.data.contentLength || 0;
                state.value.type = UpdateType.INFO;
                break;
            case 'Progress':
                state.value.downloaded += event.data.chunkLength || 0;
                if (state.value.total > 0) {
                    state.value.btn = `正在下载更新 ${Math.floor(
                        (state.value.downloaded / state.value.total) * 100
                    )}%`;
                } else {
                    state.value.btn = `正在下载更新 ${bytesToSize(
                        state.value.downloaded
                    )}`;
                }
                break;
            case 'Finished':
                state.value.stage = UpdateStage.INSTALL;
                state.value.btn = '重启以安装更新';
                state.value.type = UpdateType.SUCCESS;
                break;
        }
    };

    const checkUpdate = async () => {
        if (state.value.working) return;
        state.value.working = true;
        state.value.type = UpdateType.DEFAULT;

        try {
            switch (state.value.stage) {
                case UpdateStage.CHECK: {
                    state.value.btn = '正在检查更新';
                    const update = await check();
                    if (update) {
                        state.value.event = update;
                        if (update.available) {
                            state.value.haveUpdate = true;
                            state.value.latestVersion = update.version;
                            state.value.latestNote = update.body || '无描述';
                            state.value.latestDate = update.date || '未知';
                            state.value.btn = `更新到 ${update.version}`;
                            state.value.stage = UpdateStage.DOWNLOAD;
                            state.value.type = UpdateType.INFO;
                        } else {
                            state.value.btn = '已是最新版本';
                            state.value.type = UpdateType.SUCCESS;
                        }
                    } else {
                        state.value.btn = '已是最新版本';
                        state.value.type = UpdateType.SUCCESS;
                    }
                    break;
                }
                case UpdateStage.DOWNLOAD: {
                    state.value.btn = '正在下载更新';
                    const _state = toRaw(unref(state));
                    await _state?.event?.download(handleDownloadProgress);
                    break;
                }
                case UpdateStage.INSTALL: {
                    state.value.btn = '正在安装更新';
                    state.value.type = UpdateType.INFO;
                    const _state = toRaw(unref(state));
                    await _state?.event?.install();
                    break;
                }
            }
        } catch (e) {
            console.error('Updater:', e);
            state.value.btn = state.value.stage === UpdateStage.CHECK ? '重试检查更新' : '更新失败';
            state.value.stage = UpdateStage.CHECK;
            state.value.type = UpdateType.ERROR;
        } finally {
            state.value.working = false;
        }
    };

    return {
        updateState: state,
        checkUpdate
    };
}
