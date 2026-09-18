import { Hook } from 'require-in-the-middle'

function main() {
  new Hook(['@prisma-kb/client'], {}, function (exports, name) {
    console.log('loaded %s', name)

    return exports
  })

  require('@prisma-kb/client')
}

void main()
