// components/job-progress/index.ts — 异步任务阶段进度
Component({
  properties: {
    job: {
      type: Object,
      value: {
        stage: '',
        percent: 0,
        message: '',
      },
    },
  },
});
