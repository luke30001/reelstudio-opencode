import React from 'react';
import {Composition, Still} from 'remotion';
// @ts-ignore - alias resolved by the bundler to <reel>/src
import * as R from '@reel/Reel';

const Mod: any = R;
const Main = Mod.default;
const Cover = Mod.Cover;
const fallback = {timeline: {fps: 30, width: 1080, height: 1920, total: 90, scenes: []}, brand: {}, reel: {}};

export const Root: React.FC = () => (
  <>
    <Composition
      id="Reel"
      component={Main}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={90}
      defaultProps={fallback as any}
      calculateMetadata={({props}: any) => ({durationInFrames: Math.max(1, props.timeline.total), fps: props.timeline.fps})}
    />
    {Cover ? <Still id="Cover" component={Cover} width={1080} height={1920} defaultProps={fallback as any} /> : null}
  </>
);
