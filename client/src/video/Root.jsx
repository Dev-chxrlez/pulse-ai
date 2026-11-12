import {Composition} from 'remotion';
import {TEMPLATES} from './templates.jsx';
import {FPS, HEIGHT, WIDTH, sampleProps} from './shared.jsx';

// Duration comes from the voiceover (durationSeconds) or 15 s for previews.
const metadata = ({props}) => ({durationInFrames: Math.max(FPS * 6, Math.round((props.durationSeconds || 15) * FPS))});
export function Root() {
  return <>{Object.entries(TEMPLATES).map(([id, template]) => <Composition key={id} id={id} component={template.component} width={WIDTH} height={HEIGHT} fps={FPS} durationInFrames={FPS * 15} defaultProps={sampleProps} calculateMetadata={metadata}/>)}</>;
}
