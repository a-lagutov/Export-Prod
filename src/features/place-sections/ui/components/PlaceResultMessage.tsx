import { Fragment } from 'react'
import { VerticalSpace } from '@create-figma-plugin/ui'

/** Displays the result of a place-frames operation — green for success, red for failure. */
export function PlaceResultMessage({ result }: { result: { success: boolean; message: string } }) {
  return (
    <Fragment>
      <VerticalSpace space="extraSmall" />
      <div
        style={{
          padding: '7px 10px',
          background: result.success ? '#d4edda' : '#f8d7da',
          borderRadius: 6,
          fontSize: 11,
          color: result.success ? '#155724' : '#721c24',
        }}
      >
        {result.message}
      </div>
    </Fragment>
  )
}
