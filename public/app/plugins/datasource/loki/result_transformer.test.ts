import { CircularDataFrame, FieldCache, FieldType, MutableDataFrame } from '@grafana/data';
import { LokiStreamResult, LokiTailResponse, LokiStreamResponse, LokiResultType, TransformerOptions } from './types';
import * as ResultTransformer from './result_transformer';
import { enhanceDataFrame } from './result_transformer';
import { setTemplateSrv } from '@grafana/runtime';
import { TemplateSrv } from 'app/features/templating/template_srv';

const streamResult: LokiStreamResult[] = [
  {
    stream: {
      foo: 'bar',
    },
    values: [['1579857562021616000', "foo: [32m'bar'[39m"]],
  },
  {
    stream: {
      bar: 'foo',
    },
    values: [['1579857562031616000', "bar: 'foo'"]],
  },
];

const lokiResponse: LokiStreamResponse = {
  status: 'success',
  data: {
    result: streamResult,
    resultType: LokiResultType.Stream,
    stats: {
      summary: {
        bytesTotal: 900,
      },
    },
  },
};

jest.mock('@grafana/runtime', () => ({
  // @ts-ignore
  ...jest.requireActual('@grafana/runtime'),
  getDataSourceSrv: () => {
    return {
      getInstanceSettings: () => {
        return { name: 'Loki1' };
      },
    };
  },
}));

describe('loki result transformer', () => {
  beforeAll(() => {
    setTemplateSrv(new TemplateSrv());
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('lokiStreamResultToDataFrame', () => {
    it('converts streams to series', () => {
      const data = streamResult.map(stream => ResultTransformer.lokiStreamResultToDataFrame(stream));

      expect(data.length).toBe(2);
      expect(data[0].fields[1].labels!['foo']).toEqual('bar');
      expect(data[0].fields[0].values.get(0)).toEqual('2020-01-24T09:19:22.021Z');
      expect(data[0].fields[1].values.get(0)).toEqual(streamResult[0].values[0][1]);
      expect(data[0].fields[2].values.get(0)).toEqual('2b431b8a98b80b3b2c2f4cd2444ae6cb');
      expect(data[1].fields[0].values.get(0)).toEqual('2020-01-24T09:19:22.031Z');
      expect(data[1].fields[1].values.get(0)).toEqual(streamResult[1].values[0][1]);
      expect(data[1].fields[2].values.get(0)).toEqual('75d73d66cff40f9d1a1f2d5a0bf295d0');
    });

    it('should always generate unique ids for logs', () => {
      const streamResultWithDuplicateLogs: LokiStreamResult[] = [
        {
          stream: {
            foo: 'bar',
          },

          values: [
            ['1579857562021616000', 't=2020-02-12T15:04:51+0000 lvl=info msg="Duplicated"'],
            ['1579857562021616000', 't=2020-02-12T15:04:51+0000 lvl=info msg="Duplicated"'],
            ['1579857562021616000', 't=2020-02-12T15:04:51+0000 lvl=info msg="Non-duplicated"'],
            ['1579857562021616000', 't=2020-02-12T15:04:51+0000 lvl=info msg="Duplicated"'],
          ],
        },
        {
          stream: {
            bar: 'foo',
          },
          values: [['1579857562021617000', 't=2020-02-12T15:04:51+0000 lvl=info msg="Non-dupliicated"']],
        },
      ];

      const data = streamResultWithDuplicateLogs.map(stream => ResultTransformer.lokiStreamResultToDataFrame(stream));

      expect(data[0].fields[2].values.get(0)).toEqual('65cee200875f58ee1430d8bd2e8b74e7');
      expect(data[0].fields[2].values.get(1)).toEqual('65cee200875f58ee1430d8bd2e8b74e7_1');
      expect(data[0].fields[2].values.get(2)).not.toEqual('65cee200875f58ee1430d8bd2e8b74e7_2');
      expect(data[0].fields[2].values.get(3)).toEqual('65cee200875f58ee1430d8bd2e8b74e7_2');
      expect(data[1].fields[2].values.get(0)).not.toEqual('65cee200875f58ee1430d8bd2e8b74e7_3');
    });
  });

  describe('lokiStreamsToDataFrames', () => {
    it('should enhance data frames', () => {
      jest.spyOn(ResultTransformer, 'enhanceDataFrame');
      const dataFrames = ResultTransformer.lokiStreamsToDataFrames(lokiResponse, { refId: 'B' }, 500, {
        derivedFields: [
          {
            matcherRegex: 'trace=(w+)',
            name: 'test',
            url: 'example.com',
          },
        ],
      });

      expect(ResultTransformer.enhanceDataFrame).toBeCalled();
      dataFrames.forEach(frame => {
        expect(
          frame.fields.filter(field => field.name === 'test' && field.type === 'string').length
        ).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('appendResponseToBufferedData', () => {
    it('should return a dataframe with ts in iso format', () => {
      const tailResponse: LokiTailResponse = {
        streams: [
          {
            stream: {
              filename: '/var/log/grafana/grafana.log',
              job: 'grafana',
            },
            values: [
              [
                '1581519914265798400',
                't=2020-02-12T15:04:51+0000 lvl=info msg="Starting Grafana" logger=server version=6.7.0-pre commit=6f09bc9fb4 branch=issue-21929 compiled=2020-02-11T20:43:28+0000',
              ],
            ],
          },
        ],
      };

      const data = new CircularDataFrame({ capacity: 1 });
      data.addField({ name: 'ts', type: FieldType.time, config: { displayName: 'Time' } });
      data.addField({ name: 'tsNs', type: FieldType.time, config: { displayName: 'Time ns' } });
      data.addField({ name: 'line', type: FieldType.string }).labels = { job: 'grafana' };
      data.addField({ name: 'labels', type: FieldType.other });
      data.addField({ name: 'id', type: FieldType.string });

      ResultTransformer.appendResponseToBufferedData(tailResponse, data);
      expect(data.get(0)).toEqual({
        ts: '2020-02-12T15:05:14.265Z',
        tsNs: '1581519914265798400',
        line:
          't=2020-02-12T15:04:51+0000 lvl=info msg="Starting Grafana" logger=server version=6.7.0-pre commit=6f09bc9fb4 branch=issue-21929 compiled=2020-02-11T20:43:28+0000',
        labels: { filename: '/var/log/grafana/grafana.log' },
        id: '19e8e093d70122b3b53cb6e24efd6e2d',
      });
    });

    it('should always generate unique ids for logs', () => {
      const tailResponse: LokiTailResponse = {
        streams: [
          {
            stream: {
              filename: '/var/log/grafana/grafana.log',
              job: 'grafana',
            },
            values: [
              ['1581519914265798400', 't=2020-02-12T15:04:51+0000 lvl=info msg="Dupplicated 1"'],
              ['1581519914265798400', 't=2020-02-12T15:04:51+0000 lvl=info msg="Dupplicated 1"'],
              ['1581519914265798400', 't=2020-02-12T15:04:51+0000 lvl=info msg="Dupplicated 2"'],
              ['1581519914265798400', 't=2020-02-12T15:04:51+0000 lvl=info msg="Not dupplicated"'],
              ['1581519914265798400', 't=2020-02-12T15:04:51+0000 lvl=info msg="Dupplicated 1"'],
              ['1581519914265798400', 't=2020-02-12T15:04:51+0000 lvl=info msg="Dupplicated 2"'],
            ],
          },
        ],
      };

      const data = new CircularDataFrame({ capacity: 6 });
      data.addField({ name: 'ts', type: FieldType.time, config: { displayName: 'Time' } });
      data.addField({ name: 'tsNs', type: FieldType.time, config: { displayName: 'Time ns' } });
      data.addField({ name: 'line', type: FieldType.string }).labels = { job: 'grafana' };
      data.addField({ name: 'labels', type: FieldType.other });
      data.addField({ name: 'id', type: FieldType.string });

      ResultTransformer.appendResponseToBufferedData(tailResponse, data);
      expect(data.get(0).id).toEqual('870e4d105741bdfc2c67904ee480d4f3');
      expect(data.get(1).id).toEqual('870e4d105741bdfc2c67904ee480d4f3_1');
      expect(data.get(2).id).toEqual('707e4ec2b842f389dbb993438505856d');
      expect(data.get(3).id).toEqual('78f044015a58fad3e257a855b167d85e');
      expect(data.get(4).id).toEqual('870e4d105741bdfc2c67904ee480d4f3_2');
      expect(data.get(5).id).toEqual('707e4ec2b842f389dbb993438505856d_1');
    });
  });

  describe('createMetricLabel', () => {
    it('should create correct label based on passed variables', () => {
      const label = ResultTransformer.createMetricLabel({}, ({
        scopedVars: { testLabel: { selected: true, text: 'label1', value: 'label1' } },
        legendFormat: '{{$testLabel}}',
      } as unknown) as TransformerOptions);
      expect(label).toBe('label1');
    });
  });
});

describe('enhanceDataFrame', () => {
  it('adds links to fields', () => {
    const df = new MutableDataFrame({ fields: [{ name: 'line', values: ['nothing', 'trace1=1234', 'trace2=foo'] }] });
    enhanceDataFrame(df, {
      derivedFields: [
        {
          matcherRegex: 'trace1=(\\w+)',
          name: 'trace1',
          url: 'http://localhost/${__value.raw}',
        },
        {
          matcherRegex: 'trace2=(\\w+)',
          name: 'trace2',
          url: 'test',
          datasourceUid: 'uid',
        },
        {
          matcherRegex: 'trace2=(\\w+)',
          name: 'trace2',
          url: 'test',
          datasourceUid: 'uid2',
        },
      ],
    });
    expect(df.fields.length).toBe(3);
    const fc = new FieldCache(df);
    expect(fc.getFieldByName('trace1')!.values.toArray()).toEqual([null, '1234', null]);
    expect(fc.getFieldByName('trace1')!.config.links![0]).toEqual({
      url: 'http://localhost/${__value.raw}',
      title: '',
    });

    expect(fc.getFieldByName('trace2')!.values.toArray()).toEqual([null, null, 'foo']);
    expect(fc.getFieldByName('trace2')!.config.links!.length).toBe(2);
    expect(fc.getFieldByName('trace2')!.config.links![0]).toEqual({
      title: '',
      internal: { datasourceName: 'Loki1', datasourceUid: 'uid', query: { query: 'test' } },
      url: '',
    });
    expect(fc.getFieldByName('trace2')!.config.links![1]).toEqual({
      title: '',
      internal: { datasourceName: 'Loki1', datasourceUid: 'uid2', query: { query: 'test' } },
      url: '',
    });
  });
});
