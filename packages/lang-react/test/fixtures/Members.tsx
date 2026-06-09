import { Form } from 'antd';
import { motion } from 'framer-motion';

export function Panel({ data }: PanelProps) {
  const ok = data.includes(1);
  return ok ? (
    <Form.Item label="x">
      <motion.div animate={1} />
    </Form.Item>
  ) : null;
}
